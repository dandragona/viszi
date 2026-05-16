import { NavLink } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import type { DiagramIndex, DiagramIndexEntry, FlowTrigger } from '../../model/types.js';

const STORAGE_KEY = 'viszi.sidebar.expanded.v1';

type ChildrenMap = Map<string, DiagramIndexEntry[]>;

function buildChildrenMap(index: DiagramIndex): ChildrenMap {
  const map: ChildrenMap = new Map();
  for (const d of index.diagrams) {
    if (!d.parentId) continue;
    const arr = map.get(d.parentId) ?? [];
    arr.push(d);
    map.set(d.parentId, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.level - b.level || a.title.localeCompare(b.title));
  }
  return map;
}

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveExpanded(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // localStorage may be unavailable (private mode, quota) — silently skip.
  }
}

function collectAllIds(entries: DiagramIndexEntry[], children: ChildrenMap): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    out.push(id);
    for (const c of children.get(id) ?? []) walk(c.id);
  };
  for (const e of entries) walk(e.id);
  return out;
}

const TRIGGER_ORDER: FlowTrigger[] = ['http', 'cli', 'cron', 'event', 'init', 'other'];

export function Sidebar(props: { index: DiagramIndex }) {
  const { index } = props;
  const root = index.diagrams.find((d) => d.id === index.rootSystemId);
  const children = useMemo(() => buildChildrenMap(index), [index]);

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = loadExpanded();
    // First-time visitors: expand the root system + each top-level flow.
    if (initial.size === 0) {
      if (root) initial.add(root.id);
      for (const f of index.flows) initial.add(f.id);
    }
    return initial;
  });

  useEffect(() => {
    saveExpanded(expanded);
  }, [expanded]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const all = new Set<string>();
    if (root) for (const id of collectAllIds([root], children)) all.add(id);
    for (const id of collectAllIds(
      index.flows.map((f) => index.diagrams.find((d) => d.id === f.id)).filter(Boolean) as DiagramIndexEntry[],
      children,
    )) all.add(id);
    setExpanded(all);
  };
  const collapseAll = () => setExpanded(new Set());

  const flowsByTrigger = useMemo(() => {
    const groups = new Map<FlowTrigger, { id: string; title: string; trigger: FlowTrigger }[]>();
    for (const f of index.flows) {
      const arr = groups.get(f.trigger) ?? [];
      arr.push(f);
      groups.set(f.trigger, arr);
    }
    return groups;
  }, [index.flows]);

  return (
    <aside className="sidebar">
      <div className="sidebar-section-head">
        <h3>System</h3>
        <div className="sidebar-bulk">
          <button type="button" onClick={expandAll} title="Expand all">+</button>
          <button type="button" onClick={collapseAll} title="Collapse all">−</button>
        </div>
      </div>
      {root && <TreeNode entry={root} children_={children} expanded={expanded} toggle={toggle} />}

      {index.flows.length > 0 && (
        <div className="sidebar-section-head" style={{ marginTop: 14 }}>
          <h3>Flows</h3>
        </div>
      )}
      {TRIGGER_ORDER.map((trigger) => {
        const flows = flowsByTrigger.get(trigger);
        if (!flows || flows.length === 0) return null;
        return (
          <div key={trigger} className="flow-group">
            <div className="flow-group-label">{trigger}</div>
            {flows.map((f) => {
              const entry = index.diagrams.find((d) => d.id === f.id);
              if (!entry) return null;
              return (
                <TreeNode
                  key={entry.id}
                  entry={entry}
                  children_={children}
                  expanded={expanded}
                  toggle={toggle}
                />
              );
            })}
          </div>
        );
      })}
    </aside>
  );
}

function TreeNode({
  entry,
  children_,
  expanded,
  toggle,
  depth = 0,
}: {
  entry: DiagramIndexEntry;
  children_: ChildrenMap;
  expanded: Set<string>;
  toggle: (id: string) => void;
  depth?: number;
}) {
  const kids = children_.get(entry.id) ?? [];
  const isOpen = expanded.has(entry.id);
  const hasKids = kids.length > 0;
  return (
    <>
      <div
        className={`tree-row${entry.monoComponent ? ' tree-row-mono' : ''}`}
        style={{ paddingLeft: 6 + depth * 12 }}
        title={
          entry.monoComponent
            ? `Mostly internal to ${entry.monoComponent.componentLabel} (${Math.round(entry.monoComponent.share * 100)}% of steps)`
            : undefined
        }
      >
        {hasKids ? (
          <button
            type="button"
            className="tree-chevron"
            onClick={() => toggle(entry.id)}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="tree-chevron tree-chevron-empty" aria-hidden="true">·</span>
        )}
        <NavLink to={`/d/${encodeURIComponent(entry.id)}`} className="tree-link">
          {entry.title}
        </NavLink>
      </div>
      {isOpen &&
        kids.map((k) => (
          <TreeNode
            key={k.id}
            entry={k}
            children_={children_}
            expanded={expanded}
            toggle={toggle}
            depth={depth + 1}
          />
        ))}
    </>
  );
}
