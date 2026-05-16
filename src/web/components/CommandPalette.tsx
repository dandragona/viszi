import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSearch } from '../api';
import {
  buildFileIndex,
  parseFileQuery,
  searchEntries,
  searchFiles,
  type FileLocation,
  type FileResult,
  type SearchEntry,
} from '../search';
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

  const fileIndex = useMemo(() => (entries ? buildFileIndex(entries) : []), [entries]);
  const fileQuery = parseFileQuery(query);
  const fileMode = fileQuery !== null;

  const results = useMemo(() => {
    if (!entries) return [];
    return searchEntries(entries, query, 40);
  }, [entries, query]);

  const fileResults = useMemo(() => {
    if (!fileMode) return [];
    return searchFiles(fileIndex, fileQuery ?? '', 40);
  }, [fileMode, fileQuery, fileIndex]);

  const totalRows = fileMode
    ? fileResults.reduce((sum, f) => sum + f.locations.length, 0)
    : results.length;

  useEffect(() => setActive(0), [query, open]);

  const onPick = useCallback(
    (entry: { diagramId: string; anchor?: string }) => {
      const url = entry.anchor
        ? `/d/${encodeURIComponent(entry.diagramId)}?focus=${encodeURIComponent(entry.anchor)}`
        : `/d/${encodeURIComponent(entry.diagramId)}`;
      navigate(url);
      onClose();
    },
    [navigate, onClose],
  );

  // Flatten file results to a 1D row list for keyboard navigation.
  const fileRows = useMemo(() => {
    const out: { file: FileResult; location: FileLocation }[] = [];
    for (const f of fileResults) for (const l of f.locations) out.push({ file: f, location: l });
    return out;
  }, [fileResults]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(totalRows - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (fileMode) {
        const r = fileRows[active];
        if (r) onPick({ diagramId: r.location.diagramId, anchor: r.location.anchor });
      } else {
        const r = results[active];
        if (r) onPick(r.entry);
      }
    }
  };

  if (!open) return null;

  return (
    <div className="palette-backdrop" onClick={onClose} data-cmdk-open="true">
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Icon name={fileMode ? 'package' : 'route'} size={14} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search components, flows, files (try `f:` or a path with `/`)…"
            spellCheck={false}
            autoComplete="off"
          />
          {fileMode && <span className="palette-mode">files</span>}
          <span className="palette-hint">esc</span>
        </div>
        <div className="palette-results">
          {!entries ? (
            <div className="palette-empty">Loading index…</div>
          ) : fileMode ? (
            fileRows.length === 0 ? (
              <div className="palette-empty">No files match</div>
            ) : (
              fileRows.map((r, i) => {
                const style = r.location.componentKind ? styleForKind(r.location.componentKind) : null;
                return (
                  <div
                    key={`${r.file.path}|${r.location.diagramId}|${r.location.anchor ?? ''}`}
                    className={`palette-row ${i === active ? 'active' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => onPick({ diagramId: r.location.diagramId, anchor: r.location.anchor })}
                  >
                    <span className="palette-icon" style={style ? { color: style.accent } : undefined}>
                      <Icon name={style?.icon ?? 'package'} size={14} />
                    </span>
                    <div className="palette-text">
                      <div className="palette-label">{r.file.path}</div>
                      <div className="palette-sub">
                        <span className="palette-tag">file</span>
                        <span>{r.location.componentLabel}</span>
                        <span>· {r.location.diagramTitle}</span>
                      </div>
                    </div>
                    <span className="palette-level">L{r.location.diagramLevel}</span>
                  </div>
                );
              })
            )
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
          <span><kbd>f:</kbd> file mode</span>
          <span><kbd>⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
