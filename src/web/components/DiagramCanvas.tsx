import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  ReactFlowProvider,
} from 'reactflow';
import type { AnyDiagram, ComponentKind, EdgeKind } from '../../model/types.js';
import { ComponentNode, type ComponentNodeData } from './nodes/ComponentNode';
import { FlowStepNode, type FlowStepNodeData } from './nodes/FlowStepNode';
import { LaneHeaderNode, type LaneHeaderNodeData } from './nodes/LaneHeaderNode';
import { layoutWithElk } from '../layout/elk';
import { Icon } from './Icon';
import { TRIGGER_ICON } from '../theme';
import { FilesPanel, type FilesPanelData } from './FilesPanel';
import { SubFlowPanel } from './SubFlowPanel';

function parseHashParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.length > 1 ? hash.slice(1) : '');
}

function parseHideHash(hash: string): Set<string> {
  const raw = parseHashParams(hash).get('hide');
  if (!raw) return new Set();
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

function parseExpandHash(hash: string): string | undefined {
  return parseHashParams(hash).get('expand') ?? undefined;
}

function writeHashParam(currentHash: string, key: string, value: string | undefined): string {
  const params = parseHashParams(currentHash);
  if (!value) params.delete(key);
  else params.set(key, value);
  const out = params.toString();
  return out ? `#${out}` : '';
}

function writeHideHash(currentHash: string, hidden: Set<string>): string {
  return writeHashParam(currentHash, 'hide', hidden.size === 0 ? undefined : Array.from(hidden).join(','));
}

const EDGE_STYLES: Record<EdgeKind, { stroke: string; strokeWidth: number; dasharray?: string }> = {
  imports: { stroke: 'rgba(148,163,184,0.55)', strokeWidth: 1.5 },
  calls: { stroke: 'rgba(167,139,250,0.75)', strokeWidth: 1.5, dasharray: '4 4' },
  reads: { stroke: 'rgba(52,211,153,0.65)', strokeWidth: 1.5, dasharray: '2 4' },
  writes: { stroke: 'rgba(251,191,36,0.75)', strokeWidth: 1.5 },
  emits: { stroke: 'rgba(34,211,238,0.75)', strokeWidth: 1.5, dasharray: '6 3' },
  flow: { stroke: 'rgba(96,165,250,0.85)', strokeWidth: 2 },
};

const NODE_TYPES = {
  component: ComponentNode,
  flowStep: FlowStepNode,
  laneHeader: LaneHeaderNode,
};

type NodeData = ComponentNodeData | FlowStepNodeData | LaneHeaderNodeData;

// Manual swim-lane layout constants (009 #1). Shared between the initial
// build and the post-paint re-measurement so the row-index math agrees.
const FLOW_STEP_HEIGHT_ASSUMED = 120;
const FLOW_STEP_GAP_Y = 50;

function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

export function DiagramCanvas({ diagram }: { diagram: AnyDiagram }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [layouted, setLayouted] = useState<Node<NodeData>[] | null>(null);
  const [filesPanel, setFilesPanel] = useState<FilesPanelData | null>(null);

  const hidden = useMemo(() => parseHideHash(location.hash), [location.hash]);
  const expandStepId = useMemo(() => parseExpandHash(location.hash), [location.hash]);

  const onDrill = useCallback(
    (id: string) => navigate(`/d/${encodeURIComponent(id)}`),
    [navigate],
  );

  const onHide = useCallback(
    (id: string) => {
      const next = new Set(parseHideHash(location.hash));
      next.add(id);
      navigate(`${location.pathname}${location.search}${writeHideHash(location.hash, next)}`, { replace: true });
    },
    [location.hash, location.pathname, location.search, navigate],
  );

  const resetHidden = useCallback(() => {
    navigate(`${location.pathname}${location.search}${writeHideHash(location.hash, new Set())}`, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);

  const onShowFiles = useCallback(
    (id: string) => {
      const node = diagram.nodes.find((n) => n.id === id);
      if (!node) return;
      setFilesPanel({ label: node.label, files: node.files });
    },
    [diagram],
  );

  // Toggle inline sub-flow expansion via URL hash (009 #4). Clicking the same
  // step twice closes the panel; clicking a different step swaps which sub-flow
  // is shown without an intermediate empty state.
  const onToggleExpand = useCallback(
    (stepId: string) => {
      const current = parseExpandHash(location.hash);
      const next = current === stepId ? undefined : stepId;
      navigate(`${location.pathname}${location.search}${writeHashParam(location.hash, 'expand', next)}`, { replace: true });
    },
    [location.hash, location.pathname, location.search, navigate],
  );
  const closeSubFlow = useCallback(() => {
    navigate(`${location.pathname}${location.search}${writeHashParam(location.hash, 'expand', undefined)}`, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);

  // Reset the files panel whenever the diagram changes (route nav).
  useEffect(() => {
    setFilesPanel(null);
  }, [diagram.id]);

  // The expanded step's sub-diagram id, if the URL hash refers to a real step.
  const expandedStep = useMemo(() => {
    if (!expandStepId || diagram.kind !== 'flow') return undefined;
    const step = diagram.steps.find((s) => s.id === expandStepId);
    if (!step?.subDiagramId) return undefined;
    return { id: step.id, label: step.action, subDiagramId: step.subDiagramId };
  }, [expandStepId, diagram]);

  const { initialNodes, edges, prepositioned } = useMemo(
    () => buildFlowElements(diagram, onDrill, onHide, onShowFiles, onToggleExpand, expandStepId, hidden),
    [diagram, onDrill, onHide, onShowFiles, onToggleExpand, expandStepId, hidden],
  );

  // Tracks the input-node-set we've already re-measured against, so the
  // measurement effect below doesn't loop after it writes new positions.
  const measuredForRef = useRef<Node<NodeData>[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    measuredForRef.current = null;
    if (prepositioned) {
      // Flow diagrams use manual swim-lane positioning (item 009 #1). ELK's
      // layered algorithm groups partitions into the same layer, not adjacent
      // columns, which is the opposite of what we want here.
      setLayouted(initialNodes as Node<NodeData>[]);
      return () => {
        cancelled = true;
      };
    }
    layoutWithElk(initialNodes, edges, { direction: 'RIGHT' })
      .then((positioned) => {
        if (!cancelled) setLayouted(positioned as Node<NodeData>[]);
      })
      .catch(() => {
        if (!cancelled) setLayouted(initialNodes);
      });
    return () => {
      cancelled = true;
    };
  }, [initialNodes, edges, prepositioned, diagram.kind]);

  // After the manual swim-lane layout paints, measure actual step-card heights
  // and re-position rows if any card exceeds the assumed STEP_HEIGHT. The
  // original layout uses a 170px stride, but cards with longer descriptions
  // render at ~190px, causing visible overlap on single-lane flows.
  useEffect(() => {
    if (!prepositioned || !layouted) return;
    if (measuredForRef.current === initialNodes) return;
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      const vp = document.querySelector('.react-flow__viewport') as HTMLElement | null;
      const scaleMatch = vp?.style.transform.match(/scale\(([\d.]+)\)/);
      const scale = scaleMatch ? Number(scaleMatch[1]) : 1;
      let maxStepH = 0;
      const heights = new Map<string, number>();
      for (const n of layouted) {
        if (n.type !== 'flowStep') continue;
        const el = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${cssEscape(n.id)}"]`);
        if (!el) continue;
        const h = el.getBoundingClientRect().height / scale;
        heights.set(n.id, h);
        if (h > maxStepH) maxStepH = h;
      }
      if (maxStepH === 0) return;
      measuredForRef.current = initialNodes;
      const oldStride = FLOW_STEP_HEIGHT_ASSUMED + FLOW_STEP_GAP_Y;
      const newStride = Math.max(Math.ceil(maxStepH) + FLOW_STEP_GAP_Y, oldStride);
      if (newStride === oldStride) return;
      // Determine baseline y (header offset = smallest flowStep y).
      let baseY = Infinity;
      for (const n of layouted) {
        if (n.type === 'flowStep' && n.position.y < baseY) baseY = n.position.y;
      }
      if (!isFinite(baseY)) return;
      const repositioned = layouted.map((n) => {
        if (n.type !== 'flowStep') return n;
        const row = Math.round((n.position.y - baseY) / oldStride);
        return { ...n, position: { x: n.position.x, y: baseY + row * newStride } };
      });
      setLayouted(repositioned);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [layouted, prepositioned, initialNodes]);

  return (
    <div className="canvas-wrap">
      <DiagramMeta diagram={diagram} />
      <RegenButton diagram={diagram} />
      {hidden.size > 0 && (
        <div className="filter-pill">
          <span>{hidden.size} hidden</span>
          <button type="button" onClick={resetHidden}>Reset</button>
        </div>
      )}
      {filesPanel && <FilesPanel data={filesPanel} onClose={() => setFilesPanel(null)} />}
      {expandedStep && (
        <SubFlowPanel
          key={expandedStep.id}
          parentStepId={expandedStep.id}
          parentStepLabel={expandedStep.label}
          subDiagramId={expandedStep.subDiagramId}
          onClose={closeSubFlow}
        />
      )}
      {!layouted ? (
        <div className="loading"><span className="spinner" /> Laying out…</div>
      ) : (
        <ReactFlowProvider>
          <ReactFlow
            nodes={layouted}
            edges={edges}
            nodeTypes={NODE_TYPES}
            fitView
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: false }}
            nodesConnectable={false}
            nodesDraggable
            elementsSelectable
            defaultEdgeOptions={{
              animated: diagram.kind === 'flow',
              type: 'smoothstep',
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="rgba(148,163,184,0.18)" />
            <MiniMap
              nodeColor={() => 'rgba(96,165,250,0.6)'}
              maskColor="rgba(11,15,23,0.7)"
              pannable
              zoomable
            />
            <Controls position="bottom-right" />
          </ReactFlow>
        </ReactFlowProvider>
      )}
    </div>
  );
}

function DiagramMeta({ diagram }: { diagram: AnyDiagram }) {
  const mono = diagram.kind === 'flow' ? diagram.meta?.monoComponent : undefined;
  return (
    <div className="diagram-meta">
      <div className="title">{diagram.title}</div>
      <div className="subtitle">
        {diagram.kind === 'flow' ? (
          <>
            <Icon name={TRIGGER_ICON[(diagram as { trigger: string }).trigger] ?? 'help-circle'} size={10} />
            {' '}
            Flow · Level {diagram.level} · {(diagram as { trigger: string }).trigger}
          </>
        ) : (
          <>System · Level {diagram.level} · scope {(diagram as { scope: string }).scope}</>
        )}
      </div>
      {mono && (
        <div className="mono-component-note" title={`${Math.round(mono.share * 100)}% of steps live inside this component`}>
          mostly internal to <strong>{mono.componentLabel}</strong>
        </div>
      )}
      {diagram.description && <div className="desc">{diagram.description}</div>}
    </div>
  );
}

function RegenButton({ diagram }: { diagram: AnyDiagram }) {
  // Static-mode bundles (`viszi export`) have no live cache to invalidate.
  if (typeof window !== 'undefined' && window.__VISZI_DATA__) return null;
  if (!diagram.meta?.regenCacheKey) return null;
  const [copied, setCopied] = useState(false);
  const cmd = `viszi regen ${diagram.id}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Older browsers / non-secure contexts — surface the command so the user can copy manually.
      window.prompt('Copy this command:', cmd);
    }
  };
  return (
    <button
      type="button"
      className="regen-button"
      onClick={copy}
      title={`Copy '${cmd}' — invalidates this diagram's cache entry and re-runs it.`}
    >
      <Icon name="zap" size={11} /> {copied ? 'Copied!' : 'Regenerate'}
    </button>
  );
}

function buildFlowElements(
  diagram: AnyDiagram,
  onDrill: (id: string) => void,
  onHide: (id: string) => void,
  onShowFiles: (id: string) => void,
  onToggleExpand: (stepId: string, subDiagramId: string) => void,
  expandStepId: string | undefined,
  hidden: Set<string>,
): {
  initialNodes: Node<NodeData>[];
  edges: Edge[];
  /** When true, nodes already have final positions and ELK should be skipped. */
  prepositioned: boolean;
} {
  if (diagram.kind === 'system') {
    const initialNodes: Node<NodeData>[] = diagram.nodes
      .filter((n) => !hidden.has(n.id))
      .map((n) => ({
        id: n.id,
        type: 'component',
        data: {
          label: n.label,
          kind: n.kind,
          description: n.description,
          files: n.files,
          subDiagramId: n.subDiagramId,
          onDrill,
          onHide,
          onShowFiles,
        } satisfies ComponentNodeData,
        position: { x: 0, y: 0 },
      }));
    const edges: Edge[] = diagram.edges
      .filter((e) => !hidden.has(e.source) && !hidden.has(e.target))
      .map((e) => {
        const s = EDGE_STYLES[e.kind] ?? EDGE_STYLES.imports;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label ?? (e.kind === 'imports' ? undefined : e.kind),
          type: 'smoothstep',
          animated: e.kind === 'calls' || e.kind === 'emits',
          style: {
            stroke: s.stroke,
            strokeWidth: s.strokeWidth,
            ...(s.dasharray ? { strokeDasharray: s.dasharray } : {}),
          },
          labelStyle: { fill: s.stroke, fontSize: 10, fontWeight: 500 },
          labelBgStyle: { fill: 'rgba(11,15,23,0.85)', fillOpacity: 0.85 },
        } as Edge;
      });
    return { initialNodes, edges, prepositioned: false };
  }

  // Flow diagram — manual swim-lane layout (009 #1).
  // Lanes (one per unique componentId, first-appearance order) are columns
  // spread left-to-right. Steps flow top-to-bottom in step-order. Lane headers
  // sit above their column. A single-lane flow collapses to a single column
  // and skips the header (the existing "mostly internal to X" banner in
  // DiagramMeta covers that case already).
  const LANE_WIDTH = 260;
  const LANE_GUTTER = 60;
  const STEP_GAP_Y = FLOW_STEP_GAP_Y;
  const STEP_HEIGHT = FLOW_STEP_HEIGHT_ASSUMED;
  const HEADER_GAP = 28;
  const HEADER_HEIGHT = 40;

  const orderedSteps = [...diagram.nodes]
    .filter((n) => !hidden.has(n.id))
    .sort((a, b) => ((a.meta?.order as number) ?? 0) - ((b.meta?.order as number) ?? 0));

  const laneIndexFor = new Map<string, number>();
  const laneInfo: { componentId: string; componentLabel: string; kind: ComponentKind; stepCount: number }[] = [];
  for (const n of orderedSteps) {
    const cid = (n.meta?.componentId as string | undefined) ?? '__nocomp__';
    if (!laneIndexFor.has(cid)) {
      laneIndexFor.set(cid, laneIndexFor.size);
      laneInfo.push({
        componentId: cid,
        componentLabel: (n.meta?.componentLabel as string | undefined) ?? cid,
        kind: n.kind,
        stepCount: 0,
      });
    }
    laneInfo[laneIndexFor.get(cid)!].stepCount++;
  }
  const showLanes = laneInfo.length >= 2;
  const laneStride = LANE_WIDTH + LANE_GUTTER;
  const headerOffsetY = showLanes ? HEADER_HEIGHT + HEADER_GAP : 0;

  const stepNodes: Node<NodeData>[] = orderedSteps.map((n, idx) => {
    const cid = (n.meta?.componentId as string | undefined) ?? '__nocomp__';
    const laneX = (laneIndexFor.get(cid) ?? 0) * laneStride;
    const subDiagramId = n.subDiagramId ?? findSubFlowForStep(diagram, n.id);
    return {
      id: n.id,
      type: 'flowStep',
      data: {
        order: (n.meta?.order as number) ?? 0,
        label: n.label,
        kind: n.kind,
        description: n.description,
        componentLabel: n.meta?.componentLabel as string | undefined,
        files: n.files.length > 0 ? n.files : undefined,
        subDiagramId,
        expanded: expandStepId === n.id && !!subDiagramId,
        onDrill,
        onToggleExpand,
        onShowFiles,
      } satisfies FlowStepNodeData,
      position: { x: laneX, y: headerOffsetY + idx * (STEP_HEIGHT + STEP_GAP_Y) },
    };
  });

  const laneHeaderNodes: Node<NodeData>[] = showLanes
    ? laneInfo.map((lane) => {
        const laneX = (laneIndexFor.get(lane.componentId) ?? 0) * laneStride;
        // Center the (220px) header in the (260px) lane column.
        return {
          id: `__lane_${lane.componentId}`,
          type: 'laneHeader',
          data: {
            label: lane.componentLabel,
            kind: lane.kind,
            stepCount: lane.stepCount,
          } satisfies LaneHeaderNodeData,
          position: { x: laneX + (LANE_WIDTH - 220) / 2, y: 0 },
          draggable: false,
          selectable: false,
        };
      })
    : [];

  // Cross-lane edges (componentId source ≠ target) get a heavier dashed style
  // so the architecturally interesting hops stand out from in-lane chains.
  const componentIdById = new Map<string, string>();
  for (const n of orderedSteps) {
    componentIdById.set(n.id, (n.meta?.componentId as string | undefined) ?? '__nocomp__');
  }
  const edges: Edge[] = diagram.edges
    .filter((e) => !hidden.has(e.source) && !hidden.has(e.target))
    .map((e) => {
      const crossLane =
        showLanes && componentIdById.get(e.source) !== componentIdById.get(e.target);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        style: crossLane
          ? { stroke: 'rgba(96,165,250,0.95)', strokeWidth: 2, strokeDasharray: '6 4' }
          : { stroke: 'rgba(96,165,250,0.55)', strokeWidth: 1.5 },
      } as Edge;
    });
  return {
    initialNodes: [...laneHeaderNodes, ...stepNodes],
    edges,
    prepositioned: true,
  };
}

function findSubFlowForStep(diagram: AnyDiagram, nodeId: string): string | undefined {
  if (diagram.kind !== 'flow') return undefined;
  const step = diagram.steps.find((s) => s.id === nodeId);
  return step?.subDiagramId;
}
