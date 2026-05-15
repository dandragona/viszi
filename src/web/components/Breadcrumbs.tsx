import { Link } from 'react-router-dom';
import type { DiagramIndex, DiagramIndexEntry } from '../../model/types.js';

export function Breadcrumbs(props: { index: DiagramIndex; currentId: string }) {
  const { index, currentId } = props;
  const byId = new Map(index.diagrams.map((d) => [d.id, d]));
  const chain: DiagramIndexEntry[] = [];

  let cursor: DiagramIndexEntry | undefined = byId.get(currentId);
  let safety = 12;
  while (cursor && safety-- > 0) {
    chain.unshift(cursor);
    if (!cursor.parentId) break;
    cursor = byId.get(cursor.parentId);
  }
  if (chain.length === 0) return <div className="breadcrumbs" />;

  return (
    <div className="breadcrumbs">
      {chain.map((c, i) => (
        <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span className="sep">›</span>}
          <Link
            to={`/d/${encodeURIComponent(c.id)}`}
            className={`crumb ${c.id === currentId ? 'current' : ''}`}
          >
            {c.title}
          </Link>
        </span>
      ))}
    </div>
  );
}
