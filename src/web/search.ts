import type { ComponentKind, DiagramKind } from '../model/types.js';

export interface SearchEntry {
  /** Where to navigate when this entry is picked. */
  diagramId: string;
  /** Optional anchor inside the diagram (a node id). */
  anchor?: string;
  kind: 'diagram' | 'component' | 'flow-step';
  diagramKind: DiagramKind;
  diagramTitle: string;
  diagramLevel: number;
  label: string;
  description?: string;
  componentKind?: ComponentKind;
  files?: string[];
  /** Pre-lowered haystack used for matching. */
  haystack: string;
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
