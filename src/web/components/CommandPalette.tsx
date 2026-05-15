import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSearch } from '../api';
import { searchEntries, type SearchEntry } from '../search';
import { Icon } from './Icon';
import { styleForKind } from '../theme';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<SearchEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const onClose = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
  }, []);

  // Global hotkey: Cmd-K / Ctrl-K opens, Esc closes.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lazy-load the search index on first open.
  useEffect(() => {
    if (open && !entries) {
      fetchSearch().then(setEntries).catch(() => setEntries([]));
    }
  }, [open, entries]);

  // Auto-focus the input when opened.
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [open]);

  const results = useMemo(() => {
    if (!entries) return [];
    return searchEntries(entries, query, 40);
  }, [entries, query]);

  useEffect(() => setActive(0), [query, open]);

  const onPick = useCallback(
    (entry: SearchEntry) => {
      const url = entry.anchor
        ? `/d/${encodeURIComponent(entry.diagramId)}?focus=${encodeURIComponent(entry.anchor)}`
        : `/d/${encodeURIComponent(entry.diagramId)}`;
      navigate(url);
      onClose();
    },
    [navigate, onClose],
  );

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[active];
      if (r) onPick(r.entry);
    }
  };

  if (!open) return null;

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Icon name="route" size={14} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search components, flows, files…"
            spellCheck={false}
            autoComplete="off"
          />
          <span className="palette-hint">esc</span>
        </div>
        <div className="palette-results">
          {!entries ? (
            <div className="palette-empty">Loading index…</div>
          ) : results.length === 0 ? (
            <div className="palette-empty">No matches</div>
          ) : (
            results.map((r, i) => {
              const e = r.entry;
              const style = e.componentKind ? styleForKind(e.componentKind) : null;
              return (
                <div
                  key={`${e.diagramId}|${e.anchor ?? ''}|${i}`}
                  className={`palette-row ${i === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => onPick(e)}
                >
                  <span className="palette-icon" style={style ? { color: style.accent } : undefined}>
                    <Icon name={style?.icon ?? (e.kind === 'flow-step' ? 'route' : 'box')} size={14} />
                  </span>
                  <div className="palette-text">
                    <div className="palette-label">{e.label}</div>
                    <div className="palette-sub">
                      <span className="palette-tag">{e.kind}</span>
                      <span>{e.diagramTitle}</span>
                      {e.componentKind && <span>· {e.componentKind}</span>}
                      {e.description && <span className="palette-desc"> · {e.description}</span>}
                    </div>
                  </div>
                  <span className="palette-level">L{e.diagramLevel}</span>
                </div>
              );
            })
          )}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
