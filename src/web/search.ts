import type { ComponentKind, DiagramKind } from '../model/types.js';

/**
 * The shape we materialise on the client *after* loading search.json and
 * joining each entry's diagramId against the deduped `diagrams` map.
 * Down-stream code (the palette + ranker) keeps working on the flat shape.
 */
export interface SearchEntry {
  diagramId: string;
  anchor?: string;
  kind: 'diagram' | 'component' | 'flow-step';
  diagramKind: DiagramKind;
  diagramTitle: string;
  diagramLevel: number;
  label: string;
  description?: string;
  componentKind?: ComponentKind;
  files?: string[];
  haystack: string;
}

/** On-disk shape of `search.json` after the interning rewrite. */
export interface SearchIndexFile {
  diagrams: Record<string, { title: string; kind: DiagramKind; level: number }>;
  entries: SearchEntryRaw[];
}

export interface SearchEntryRaw {
  diagramId: string;
  anchor?: string;
  kind: 'diagram' | 'component' | 'flow-step';
  label: string;
  description?: string;
  componentKind?: ComponentKind;
  files?: string[];
  haystack: string;
}

/**
 * Join the deduped on-disk shape back into the flat `SearchEntry` shape the
 * ranker expects. Accepts the legacy flat-array shape too so prior caches
 * remain readable.
 */
export function hydrateSearch(input: SearchIndexFile | SearchEntry[] | unknown): SearchEntry[] {
  if (Array.isArray(input)) return input as SearchEntry[];
  const obj = input as SearchIndexFile;
  if (!obj || !obj.entries || !obj.diagrams) return [];
  const diagrams = obj.diagrams;
  return obj.entries.map((e) => {
    const d = diagrams[e.diagramId] ?? { title: e.diagramId, kind: 'system' as DiagramKind, level: 1 };
    return {
      diagramId: e.diagramId,
      anchor: e.anchor,
      kind: e.kind,
      diagramKind: d.kind,
      diagramTitle: d.title,
      diagramLevel: d.level,
      label: e.label,
      description: e.description,
      componentKind: e.componentKind,
      files: e.files,
      haystack: e.haystack,
    } satisfies SearchEntry;
  });
}

export interface ScoredEntry {
  entry: SearchEntry;
  score: number;
}

export interface FileLocation {
  diagramId: string;
  diagramTitle: string;
  diagramKind: DiagramKind;
  diagramLevel: number;
  anchor?: string;
  componentLabel: string;
  componentKind?: ComponentKind;
}

export interface FileResult {
  path: string;
  locations: FileLocation[];
}

/**
 * Walk every entry and build a `file → locations[]` map. Files are sourced
 * from `entry.files` (component / flow-step nodes; capped at 12 per entry
 * by the writer). One location per (file, entry) pair, deduped on
 * `(diagramId, anchor)` so the same component doesn't appear twice.
 */
export function buildFileIndex(entries: SearchEntry[]): FileResult[] {
  const byPath = new Map<string, FileResult>();
  for (const e of entries) {
    if (!e.files || e.files.length === 0) continue;
    for (const path of e.files) {
      let r = byPath.get(path);
      if (!r) {
        r = { path, locations: [] };
        byPath.set(path, r);
      }
      const key = `${e.diagramId}|${e.anchor ?? ''}`;
      if (r.locations.some((l) => `${l.diagramId}|${l.anchor ?? ''}` === key)) continue;
      r.locations.push({
        diagramId: e.diagramId,
        diagramTitle: e.diagramTitle,
        diagramKind: e.diagramKind,
        diagramLevel: e.diagramLevel,
        anchor: e.anchor,
        componentLabel: e.label,
        componentKind: e.componentKind,
      });
    }
  }
  return Array.from(byPath.values());
}

/** Substring-rank the file index by `query`. Returns top-N results. */
export function searchFiles(index: FileResult[], query: string, limit = 30): FileResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return index.slice(0, limit);
  const scored: { file: FileResult; score: number }[] = [];
  for (const r of index) {
    const path = r.path.toLowerCase();
    const idx = path.indexOf(q);
    if (idx < 0) continue;
    // Position bonus + boundary bonus (matches at a `/` boundary outrank inner matches).
    const before = idx === 0 ? '/' : path[idx - 1];
    const boundary = /[/.]/.test(before) ? 20 : 0;
    const score = Math.max(40 - idx, 0) + boundary + r.locations.length;
    scored.push({ file: r, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.file);
}

/**
 * Decide whether a query is "file-shaped" — has at least one `/` or starts
 * with `f:`. The `f:` prefix is consumed; pure-path queries pass through.
 */
export function parseFileQuery(raw: string): string | null {
  const q = raw.trim();
  if (q.length === 0) return null;
  if (q.startsWith('f:')) return q.slice(2).trim();
  if (q.includes('/')) return q;
  return null;
}

/** Tiny but effective fuzzy ranker — substring-aware, position-aware, no dep. */
export function searchEntries(entries: SearchEntry[], query: string, limit = 30): ScoredEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries.slice(0, limit).map((entry) => ({ entry, score: 0 }));
  const tokens = q.split(/\s+/);
  const out: ScoredEntry[] = [];
  for (const entry of entries) {
    let score = 0;
    let matchedAll = true;
    for (const t of tokens) {
      const idx = entry.haystack.indexOf(t);
      if (idx < 0) {
        matchedAll = false;
        break;
      }
      // Position bonus: earlier matches score higher.
      score += Math.max(20 - idx, 0) + (entry.label.toLowerCase().includes(t) ? 30 : 0);
      // Whole-token boundary bonus.
      const before = idx === 0 ? ' ' : entry.haystack[idx - 1];
      if (!/[a-z0-9]/.test(before)) score += 10;
    }
    if (!matchedAll) continue;
    // Kind bias: diagrams rank slightly above components for short queries.
    if (entry.kind === 'diagram') score += 5;
    out.push({ entry, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
