import { Handle, Position, useNodeId } from 'reactflow';
import { styleForKind } from '../../theme';
import { Icon } from '../Icon';
import type { ComponentKind } from '../../../model/types.js';

export interface FlowStepNodeData {
  order: number;
  label: string;
  kind: ComponentKind;
  description?: string;
  componentLabel?: string;
  files?: string[];
  subDiagramId?: string;
  onDrill?: (id: string) => void;
  onShowFiles?: (id: string) => void;
}

export function FlowStepNode({ data }: { data: FlowStepNodeData }) {
  const nodeId = useNodeId();
  const style = styleForKind(data.kind);
  const clickable = !!data.subDiagramId;
  const fileCount = data.files?.length ?? 0;
  const hasFiles = fileCount > 0;
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
  const onFilesClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (nodeId && data.onShowFiles) data.onShowFiles(nodeId);
  };
  return (
    <div
      className={`viszi-node flow-step ${clickable ? 'clickable' : ''}`}
      style={{ ...cssVars, borderColor: style.border }}
      onClick={onClick}
      title={clickable ? 'Click to drill into sub-flow' : undefined}
    >
      <Handle type="target" position={Position.Top} />
      {clickable && (
        <span className="drill-corner" aria-hidden="true">
          <Icon name="arrow-up-right" size={11} />
        </span>
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
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
