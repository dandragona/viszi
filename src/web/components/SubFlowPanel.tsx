import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDiagram } from '../api';
import type { AnyDiagram, FlowDiagram } from '../../model/types.js';
import { styleForKind, TRIGGER_ICON } from '../theme';
import { Icon } from './Icon';

export interface SubFlowPanelProps {
  /** The parent step's id. Used as the title prefix and as the close key. */
  parentStepId: string;
  /** The parent step's verb-phrase label, shown in the panel header. */
  parentStepLabel: string;
  /** The sub-flow diagram id to load and render inline. */
  subDiagramId: string;
  onClose: () => void;
}

type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; diagram: FlowDiagram };

export function SubFlowPanel(props: SubFlowPanelProps) {
  const { parentStepId, parentStepLabel, subDiagramId, onClose } = props;
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    fetchDiagram(subDiagramId)
      .then((d) => {
        if (cancelled) return;
        if (d.kind !== 'flow') {
          setState({ kind: 'error', message: 'Sub-diagram is not a flow.' });
        } else {
          setState({ kind: 'ready', diagram: d as FlowDiagram });
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ kind: 'error', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [subDiagramId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className="subflow-panel" data-step-id={parentStepId} role="dialog" aria-label={`Sub-flow for ${parentStepLabel}`}>
      <header className="subflow-panel-head">
        <div className="subflow-panel-title">
          <span className="subflow-panel-tag">SUB-FLOW</span>
          <strong>{parentStepLabel}</strong>
        </div>
        <div className="subflow-panel-actions">
          <button
            type="button"
            onClick={() => navigate(`/d/${encodeURIComponent(subDiagramId)}`)}
            title="Open sub-flow on its own page (deep-linkable)"
          >
            Open page <Icon name="arrow-up-right" size={10} />
          </button>
          <button type="button" onClick={onClose} title="Close (Esc)" aria-label="Close">×</button>
        </div>
      </header>
      <div className="subflow-panel-body">
        {state.kind === 'loading' && (
          <div className="subflow-panel-loading"><span className="spinner" /> Loading sub-flow…</div>
        )}
        {state.kind === 'error' && (
          <div className="subflow-panel-error">Couldn't load sub-flow: {state.message}</div>
        )}
        {state.kind === 'ready' && <SubFlowSteps diagram={state.diagram} />}
      </div>
    </aside>
  );
}

function SubFlowSteps({ diagram }: { diagram: FlowDiagram }) {
  const triggerIcon = TRIGGER_ICON[diagram.trigger] ?? 'help-circle';
  return (
    <>
      <div className="subflow-panel-meta">
        <Icon name={triggerIcon} size={10} />
        <span>{diagram.trigger} · {diagram.steps.length} steps · Level {diagram.level}</span>
      </div>
      {diagram.description && <p className="subflow-panel-desc">{diagram.description}</p>}
      <ol className="subflow-step-list">
        {diagram.steps.map((s) => {
          const node = diagram.nodes.find((n) => n.id === s.id);
          const kind = node?.kind ?? 'unknown';
          const style = styleForKind(kind);
          const componentLabel = (node?.meta?.componentLabel as string | undefined) ?? s.componentId;
          return (
            <li key={s.id} className="subflow-step">
              <div className="subflow-step-rail" style={{ color: style.accent, background: style.background, borderColor: style.border }}>
                <span className="subflow-step-order">{s.order}</span>
                <Icon name={style.icon} size={11} />
              </div>
              <div className="subflow-step-body">
                <div className="subflow-step-component" style={{ color: style.accent }}>{componentLabel}</div>
                <div className="subflow-step-action">{s.action}</div>
                {s.description && <div className="subflow-step-desc">{s.description}</div>}
                {s.files && s.files.length > 0 && (
                  <ul className="subflow-step-files">
                    {s.files.map((f) => (
                      <li key={f} title={f}><code>{f}</code></li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** Cache fetched sub-flow shells across hovers within a session so the preview
 * chip doesn't refetch every time the user passes over a step. Keyed by
 * sub-diagram id. */
const subFlowPreviewCache = new Map<string, AnyDiagram>();

/** Imperatively prime / read the preview cache. Returns the cached diagram
 * synchronously when known, otherwise kicks off a fetch and resolves with the
 * result. Used by `FlowStepNode`'s hover preview chip. */
export async function loadSubFlowPreview(subDiagramId: string): Promise<AnyDiagram | undefined> {
  if (subFlowPreviewCache.has(subDiagramId)) return subFlowPreviewCache.get(subDiagramId);
  try {
    const d = await fetchDiagram(subDiagramId);
    subFlowPreviewCache.set(subDiagramId, d);
    return d;
  } catch {
    return undefined;
  }
}

export function readSubFlowPreviewCached(subDiagramId: string): AnyDiagram | undefined {
  return subFlowPreviewCache.get(subDiagramId);
}
