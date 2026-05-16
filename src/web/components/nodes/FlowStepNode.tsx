import { Handle, Position } from 'reactflow';
import { styleForKind } from '../../theme';
import { Icon } from '../Icon';
import type { ComponentKind } from '../../../model/types.js';

export interface FlowStepNodeData {
  order: number;
  label: string;
  kind: ComponentKind;
  description?: string;
  componentLabel?: string;
  subDiagramId?: string;
  onDrill?: (id: string) => void;
}

export function FlowStepNode({ data }: { data: FlowStepNodeData }) {
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
    e.stopPropagation();
    data.onDrill?.(data.subDiagramId);
  };
  return (
    <div
      className={`viszi-node flow-step ${clickable ? 'clickable' : ''}`}
      style={{ ...cssVars, borderColor: style.border }}
      onClick={onClick}
      title={clickable ? 'Click to drill into sub-flow' : undefined}
    >
      <Handle type="target" position={Position.Left} />
      {clickable && (
        <span className="drill-corner" aria-hidden="true">
          <Icon name="arrow-up-right" size={11} />
        </span>
      )}
      <div className="node-header">
        <span className="step-order">{data.order}</span>
        <span className="node-label">{data.label}</span>
      </div>
      {data.componentLabel && (
        <div className="node-meta" style={{ marginTop: 4 }}>
          <span style={{ color: style.accent }}>
            <Icon name={style.icon} size={11} /> {data.componentLabel}
          </span>
          {clickable && <span className="drill">drill in →</span>}
        </div>
      )}
      {data.description && <div className="node-desc" style={{ marginTop: 6 }}>{data.description}</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
