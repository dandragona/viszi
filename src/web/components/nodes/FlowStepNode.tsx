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
  return (
    <div
      className={`viszi-node flow-step ${clickable ? 'clickable' : ''}`}
      style={{ ...cssVars, borderColor: style.border }}
      onClick={() => data.subDiagramId && data.onDrill?.(data.subDiagramId)}
    >
      <Handle type="target" position={Position.Top} />
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
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
