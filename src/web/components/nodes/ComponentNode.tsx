import { Handle, Position } from 'reactflow';
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
}

export function ComponentNode({ data }: { data: ComponentNodeData }) {
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
      className={`viszi-node ${clickable ? 'clickable' : ''}`}
      style={{ ...cssVars, borderColor: style.border }}
      onClick={() => data.subDiagramId && data.onDrill?.(data.subDiagramId)}
    >
      <Handle type="target" position={Position.Left} />
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
