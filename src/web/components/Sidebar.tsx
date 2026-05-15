import { NavLink } from 'react-router-dom';
import type { DiagramIndex } from '../../model/types.js';

export function Sidebar(props: { index: DiagramIndex }) {
  const { index } = props;
  const root = index.diagrams.find((d) => d.id === index.rootSystemId);

  return (
    <aside className="sidebar">
      <h3>System</h3>
      {root && (
        <NavLink to={`/d/${encodeURIComponent(root.id)}`} end>
          ◇ {root.title}
        </NavLink>
      )}

      {index.flows.length > 0 && <h3>Flows</h3>}
      {index.flows.map((f) => (
        <NavLink key={f.id} to={`/d/${encodeURIComponent(f.id)}`}>
          ▸ {f.title}
          <span className="badge">{f.trigger}</span>
        </NavLink>
      ))}

      <h3>All Diagrams</h3>
      {index.diagrams
        .slice()
        .sort((a, b) => a.level - b.level || a.title.localeCompare(b.title))
        .map((d) => (
          <NavLink key={d.id} to={`/d/${encodeURIComponent(d.id)}`}>
            <span style={{ opacity: 0.5, marginRight: 6 }}>L{d.level}</span>
            {d.title}
            <span className="badge">{d.kind}</span>
          </NavLink>
        ))}
    </aside>
  );
}
