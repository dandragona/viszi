import { styleForKind } from '../../theme';
import { Icon } from '../Icon';
import type { ComponentKind } from '../../../model/types.js';

export interface LaneHeaderNodeData {
  label: string;
  kind: ComponentKind;
  stepCount: number;
}

export function LaneHeaderNode({ data }: { data: LaneHeaderNodeData }) {
  const style = styleForKind(data.kind);
  return (
    <div
      className="lane-header"
      style={{
        borderColor: style.border,
        background: style.background,
        color: style.accent,
      }}
      title={`${data.stepCount} step${data.stepCount === 1 ? '' : 's'} in this lane`}
    >
      <Icon name={style.icon} size={12} />
      <span className="lane-header-label">{data.label}</span>
      <span className="lane-header-count">{data.stepCount}</span>
    </div>
  );
}
