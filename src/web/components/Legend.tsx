import { useEffect, useRef, useState } from 'react';
import { COMPONENT_KINDS, styleForKind } from '../theme';
import { Icon } from './Icon';

export function Legend() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (ev: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="legend" ref={wrapRef}>
      <button
        type="button"
        className="legend-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Component kind legend"
      >
        <span className="legend-swatches" aria-hidden="true">
          <span style={{ background: styleForKind('service').accent }} />
          <span style={{ background: styleForKind('database').accent }} />
          <span style={{ background: styleForKind('ui').accent }} />
          <span style={{ background: styleForKind('cli').accent }} />
        </span>
        Legend
      </button>
      {open && (
        <div className="legend-popover" role="dialog" aria-label="Component kinds">
          <div className="legend-grid">
            {COMPONENT_KINDS.map((kind) => {
              const s = styleForKind(kind);
              return (
                <div className="legend-row" key={kind}>
                  <span
                    className="legend-dot"
                    style={{ background: s.background, borderColor: s.border, color: s.accent }}
                  >
                    <Icon name={s.icon} size={10} />
                  </span>
                  <span className="legend-name">{kind}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
