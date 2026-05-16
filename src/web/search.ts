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
