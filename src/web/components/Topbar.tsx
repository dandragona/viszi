import { Link } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import type { DiagramIndex } from '../../model/types.js';
import { Breadcrumbs } from './Breadcrumbs';

export function Topbar(props: { index: DiagramIndex; location: Location }) {
  const { index, location } = props;
  const currentId = location.pathname.startsWith('/d/')
    ? decodeURIComponent(location.pathname.slice(3))
    : index.rootSystemId;

  return (
    <div className="topbar">
      <Link to="/" className="brand">
        <span className="dot" />
        viszi
      </Link>
      <Breadcrumbs index={index} currentId={currentId} />
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>
          {index.diagrams.length} diagrams · {index.meta.aiCallCount} AI calls
        </span>
      </div>
    </div>
  );
}
