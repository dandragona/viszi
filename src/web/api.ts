import type { AnyDiagram, DiagramIndex } from '../model/types.js';
import type { SearchEntry } from './search';

const API_BASE = '/api';

declare global {
  interface Window {
    __VISZI_DATA__?: {
      index: DiagramIndex;
      diagrams: Record<string, AnyDiagram>;
      search?: SearchEntry[];
    };
  }
}

const inline = typeof window !== 'undefined' ? window.__VISZI_DATA__ : undefined;

export const STATIC_MODE = !!inline;

async function fetchJson<T>(path: string): Promise<T> {
  const r = await fetch(API_BASE + path);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} (${path})`);
  return (await r.json()) as T;
}

export function fetchIndex(): Promise<DiagramIndex> {
  if (inline) return Promise.resolve(inline.index);
  return fetchJson<DiagramIndex>('/index');
}

export function fetchDiagram(id: string): Promise<AnyDiagram> {
  if (inline) {
    const d = inline.diagrams[id];
    if (!d) return Promise.reject(new Error(`Diagram ${id} not found`));
    return Promise.resolve(d);
  }
  return fetchJson<AnyDiagram>(`/diagrams/${encodeURIComponent(id)}`);
}

export function fetchSearch(): Promise<SearchEntry[]> {
  if (inline) return Promise.resolve(inline.search ?? []);
  return fetchJson<SearchEntry[]>('/search');
}
