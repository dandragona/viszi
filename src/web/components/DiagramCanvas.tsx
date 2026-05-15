import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  ReactFlowProvider,
} from 'reactflow';
import type { AnyDiagram, EdgeKind } from '../../model/types.js';
import { ComponentNode, type ComponentNodeData } from './nodes/ComponentNode';
import { FlowStepNode, type FlowStepNodeData } from './nodes/FlowStepNode';
import { layoutWithElk } from '../layout/elk';
import { Icon } from './Icon';
import { TRIGGER_ICON } from '../theme';

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
};

type NodeData = ComponentNodeData | FlowStepNodeData;

export function DiagramCanvas({ diagram }: { diagram: AnyDiagram }) {
  const navigate = useNavigate();
  const [layouted, setLayouted] = useState<Node<NodeData>[] | null>(null);

  const onDrill = useCallback(
    (id: string) => navigate(`/d/${encodeURIComponent(id)}`),
    [navigate],
  );

  const { initialNodes, edges } = useMemo(() => buildFlowElements(diagram, onDrill), [diagram, onDrill]);

  useEffect(() => {
    let cancelled = false;
    layoutWithElk(initialNodes, edges, {
      direction: diagram.kind === 'flow' ? 'DOWN' : 'RIGHT',
    })
      .then((positioned) => {
        if (!cancelled) setLayouted(positioned as Node<NodeData>[]);
      })
      .catch(() => {
        if (!cancelled) setLayouted(initialNodes);
      });
    return () => {
      cancelled = true;
    };
  }, [initialNodes, edges, diagram.kind]);

  return (
    <div className="canvas-wrap">
      <DiagramMeta diagram={diagram} />
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
      {diagram.description && <div className="desc">{diagram.description}</div>}
    </div>
  );
}

function buildFlowElements(diagram: AnyDiagram, onDrill: (id: string) => void): {
  initialNodes: Node<NodeData>[];
  edges: Edge[];
} {
  if (diagram.kind === 'system') {
    const initialNodes: Node<NodeData>[] = diagram.nodes.map((n) => ({
      id: n.id,
      type: 'component',
      data: {
        label: n.label,
        kind: n.kind,
        description: n.description,
        files: n.files,
        subDiagramId: n.subDiagramId,
        onDrill,
      } satisfies ComponentNodeData,
      position: { x: 0, y: 0 },
    }));
    const edges: Edge[] = diagram.edges.map((e) => {
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
    return { initialNodes, edges };
  }

  // Flow diagram
  const initialNodes: Node<NodeData>[] = diagram.nodes.map((n) => ({
    id: n.id,
    type: 'flowStep',
    data: {
      order: (n.meta?.order as number) ?? 0,
      label: n.label,
      kind: n.kind,
      description: n.description,
      componentLabel: n.meta?.componentLabel as string | undefined,
      subDiagramId: n.subDiagramId ?? findSubFlowForStep(diagram, n.id),
      onDrill,
    } satisfies FlowStepNodeData,
    position: { x: 0, y: 0 },
  }));
  const edges: Edge[] = diagram.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
  }));
  return { initialNodes, edges };
}

function findSubFlowForStep(diagram: AnyDiagram, nodeId: string): string | undefined {
  if (diagram.kind !== 'flow') return undefined;
  const step = diagram.steps.find((s) => s.id === nodeId);
  return step?.subDiagramId;
}
