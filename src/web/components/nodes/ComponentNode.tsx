import { Handle, Position, useNodeId } from 'reactflow';
import { styleForKind } from '../../theme';
import { Icon } from '../Icon';
import type { ComponentKind } from '../../../model/types.js';

export interface ComponentNodeData {
  label: string;
  kind: ComponentKind;
  description?: string;
  files?: string[];
  subDiagramId?: string;
  onDrill?: (id: string) => void;
  onHide?: (id: string) => void;
}

export function ComponentNode({ data }: { data: ComponentNodeData }) {
  const nodeId = useNodeId();
  const style = styleForKind(data.kind);
  const clickable = !!data.subDiagramId;
  const cssVars = {
    ['--node-accent' as never]: style.accent,
    ['--node-bg' as never]: style.background,
    ['--node-border' as never]: style.border,
    ['--node-glow' as never]: style.glow,
  } as React.CSSProperties;

  const onClick = (e: React.MouseEvent) => {
    if (!data.subDiagramId) return;
    // Stop React Flow's pane handlers from swallowing the click.
    e.stopPropagation();
    data.onDrill?.(data.subDiagramId);
  };

  const onHide = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (nodeId && data.onHide) data.onHide(nodeId);
  };

  return (
    <div
      className={`viszi-node ${clickable ? 'clickable' : ''}`}
      style={{ ...cssVars, borderColor: style.border }}
      onClick={onClick}
      title={clickable ? 'Click to drill into sub-diagram' : undefined}
    >
      <Handle type="target" position={Position.Left} />
      {data.onHide && nodeId && (
        <button
          type="button"
          className="node-hide"
          onClick={onHide}
          title="Hide this node"
          aria-label="Hide this node"
        >
          ×
        </button>
      )}
      {clickable && (
        <span className="drill-corner" aria-hidden="true">
          <Icon name="arrow-up-right" size={11} />
        </span>
      )}
      <div className="node-header">
        <span className="node-icon">
          <Icon name={style.icon} size={14} />
        </span>
        <span className="node-label">{data.label}</span>
        <span className="node-kind">{data.kind}</span>
      </div>
      {data.description && <div className="node-desc">{data.description}</div>}
      <div className="node-meta">
        {data.files && data.files.length > 0 && <span>{data.files.length} files</span>}
        {clickable && <span className="drill">drill in →</span>}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
