import { useEffect, useRef, useState } from 'react';
import { Handle, Position, useNodeId } from 'reactflow';
import { styleForKind } from '../../theme';
import { Icon } from '../Icon';
import { loadSubFlowPreview, readSubFlowPreviewCached } from '../SubFlowPanel';
import type { ComponentKind, FlowDiagram } from '../../../model/types.js';

export interface FlowStepNodeData {
  order: number;
  label: string;
  kind: ComponentKind;
  description?: string;
  componentLabel?: string;
  files?: string[];
  subDiagramId?: string;
  /** True when this step is the currently-expanded one (URL hash `expand=`). */
  expanded?: boolean;
  /** Navigate to the sub-flow as its own page. Used by card-body click. */
  onDrill?: (id: string) => void;
  /** Toggle inline expansion (URL hash) for this step. */
  onToggleExpand?: (stepId: string, subDiagramId: string) => void;
  onShowFiles?: (id: string) => void;
}

export function FlowStepNode({ data }: { data: FlowStepNodeData }) {
  const nodeId = useNodeId();
  const style = styleForKind(data.kind);
  const drillable = !!data.subDiagramId;
  const fileCount = data.files?.length ?? 0;
  const hasFiles = fileCount > 0;
  const [hoverPreview, setHoverPreview] = useState<{ count: number; firstLabels: string[] } | null>(() =>
    data.subDiagramId ? extractPreview(readSubFlowPreviewCached(data.subDiagramId)) : null,
  );
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cssVars = {
    ['--node-accent' as never]: style.accent,
    ['--node-bg' as never]: style.background,
    ['--node-border' as never]: style.border,
    ['--node-glow' as never]: style.glow,
  } as React.CSSProperties;

  // Card body navigates to the sub-flow as its own page (deep-linkable fallback).
  const onCardClick = (e: React.MouseEvent) => {
    if (!data.subDiagramId) return;
    e.stopPropagation();
    data.onDrill?.(data.subDiagramId);
  };

  // Chevron toggles inline expansion in a right-side panel (URL hash persisted).
  const onChevronClick = (e: React.MouseEvent) => {
    if (!data.subDiagramId || !nodeId) return;
    e.stopPropagation();
    data.onToggleExpand?.(nodeId, data.subDiagramId);
  };

  const onFilesClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (nodeId && data.onShowFiles) data.onShowFiles(nodeId);
  };

  const onCardEnter = () => {
    if (!data.subDiagramId) return;
    // Debounce by ~120ms so we don't fire fetches on a casual pass-over.
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      loadSubFlowPreview(data.subDiagramId!).then((d) => {
        const preview = extractPreview(d);
        if (preview) setHoverPreview(preview);
      });
    }, 120);
  };
  const onCardLeave = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };
  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  const showPreviewChip = drillable && hoverPreview !== null;

  return (
    <div
      className={`viszi-node flow-step ${drillable ? 'clickable' : ''} ${data.expanded ? 'is-expanded' : ''}`}
      style={{ ...cssVars, borderColor: data.expanded ? style.accent : style.border }}
      onClick={onCardClick}
      onMouseEnter={onCardEnter}
      onMouseLeave={onCardLeave}
      title={drillable ? 'Click card to open sub-flow as page · click chevron to expand inline' : undefined}
    >
      <Handle type="target" position={Position.Top} />
      {drillable && (
        <button
          type="button"
          className={`flow-step-chevron ${data.expanded ? 'open' : ''}`}
          onClick={onChevronClick}
          title={data.expanded ? 'Collapse sub-flow' : 'Expand sub-flow inline'}
          aria-pressed={!!data.expanded}
          aria-label={data.expanded ? 'Collapse sub-flow' : 'Expand sub-flow inline'}
        >
          <Icon name={data.expanded ? 'arrow-up-right' : 'arrow-up-right'} size={11} />
        </button>
      )}
      {data.componentLabel && (
        <div
          className="flow-step-lane"
          style={{ color: style.accent, borderRightColor: style.border }}
          title={data.componentLabel}
        >
          <Icon name={style.icon} size={14} />
          <span className="flow-step-lane-label">{data.componentLabel}</span>
        </div>
      )}
      <div className="flow-step-body">
        <div className="flow-step-action">
          <span className="step-order">{data.order}</span>
          <span className="node-label">{data.label}</span>
        </div>
        {data.description && <div className="flow-step-desc">{data.description}</div>}
        {hasFiles && data.onShowFiles && (
          <button
            type="button"
            className="flow-step-files"
            onClick={onFilesClick}
            title={`Show the ${fileCount} file${fileCount === 1 ? '' : 's'} that implement this step`}
          >
            <Icon name="file-text" size={10} />
            {fileCount} file{fileCount === 1 ? '' : 's'}
          </button>
        )}
      </div>
      {showPreviewChip && !data.expanded && (
        <div className="flow-step-preview" role="tooltip">
          <span className="flow-step-preview-arrow">↘</span>
          <span className="flow-step-preview-count">{hoverPreview!.count} sub-step{hoverPreview!.count === 1 ? '' : 's'}</span>
          {hoverPreview!.firstLabels.length > 0 && (
            <span className="flow-step-preview-chain">{hoverPreview!.firstLabels.join(' → ')}</span>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function extractPreview(d: unknown): { count: number; firstLabels: string[] } | null {
  if (!d || typeof d !== 'object') return null;
  const diag = d as Partial<FlowDiagram>;
  if (diag.kind !== 'flow' || !Array.isArray(diag.steps)) return null;
  const labels = diag.steps.slice(0, 4).map((s) => truncate(s.action, 32));
  return { count: diag.steps.length, firstLabels: labels };
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}
