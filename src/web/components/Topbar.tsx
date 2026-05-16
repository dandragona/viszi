import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useMemo } from 'react';
import type { Location } from 'react-router-dom';
import type { DiagramIndex } from '../../model/types.js';
import { Breadcrumbs } from './Breadcrumbs';

export function Topbar(props: { index: DiagramIndex; location: Location }) {
  const { index, location } = props;
  const navigate = useNavigate();
  const currentId = location.pathname.startsWith('/d/')
    ? decodeURIComponent(location.pathname.slice(3))
    : index.rootSystemId;

  // Resolve a parent diagram id (if any) so the back button still works on
  // direct deep-links where the browser back-stack is empty.
  const parentId = useMemo(() => {
    const entry = index.diagrams.find((d) => d.id === currentId);
    return entry?.parentId;
  }, [index.diagrams, currentId]);

  const canGoBack = currentId !== index.rootSystemId && (parentId !== undefined || window.history.length > 1);

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else if (parentId) {
      navigate(`/d/${encodeURIComponent(parentId)}`);
    } else {
      navigate('/');
    }
  };

  // Esc → back (when no input/palette is focused).
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      const t = ev.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
      // Skip if the command palette is open — let it handle Esc itself.
      if (document.querySelector('[data-cmdk-open="true"]')) return;
      if (!canGoBack) return;
      ev.preventDefault();
      goBack();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canGoBack, parentId, currentId]);

  return (
    <div className="topbar">
      <Link to="/" className="brand">
        <span className="dot" />
        viszi
      </Link>
      <button
        type="button"
        className="topbar-back"
        onClick={goBack}
        disabled={!canGoBack}
        title="Back (Esc)"
        aria-label="Back"
      >
        ← Back
      </button>
      <Breadcrumbs index={index} currentId={currentId} />
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>
          {index.diagrams.length} diagrams · {index.meta.aiCallCount} AI calls
        </span>
      </div>
    </div>
  );
}
