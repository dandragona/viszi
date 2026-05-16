import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  cacheSubdir,
  diagramsSubdir,
  ensureDir,
  indexFile,
  metaFile,
  sanitizeId,
} from '../shared/paths.js';
import { viszVersion } from '../shared/version.js';
import type {
  AnyDiagram,
  ComponentKind,
  DiagramIndex,
  DiagramIndexEntry,
  DiagramKind,
  FlowDiagram,
  FlowTrigger,
  SystemDiagram,
} from './types.js';

export interface SearchEntryFile {
  diagramId: string;
  anchor?: string;
  kind: 'diagram' | 'component' | 'flow-step';
  label: string;
  description?: string;
  componentKind?: ComponentKind;
  files?: string[];
  haystack: string;
}

export interface SearchIndexFile {
  /** Per-diagram constants — interned to keep `search.json` small. */
  diagrams: Record<string, { title: string; kind: DiagramKind; level: number }>;
  entries: SearchEntryFile[];
}

export interface WriterOpts {
  outputDir: string;
  repoRoot: string;
  levels: number;
  flowsEnabled: boolean;
}

/**
 * Buffers diagrams in memory while the analysis runs, then flushes them
 * to `<outputDir>/diagrams/<id>.json` plus an `index.json`.
 */
export class DiagramWriter {
  private readonly diagrams = new Map<string, AnyDiagram>();
  private aiCallCount = 0;
  private estimatedCostUsd = 0;

  constructor(private readonly opts: WriterOpts) {
    ensureDir(opts.outputDir);
    ensureDir(diagramsSubdir(opts.outputDir));
    ensureDir(cacheSubdir(opts.outputDir));
  }

  add(diagram: AnyDiagram): void {
    this.diagrams.set(diagram.id, diagram);
  }

  has(id: string): boolean {
    return this.diagrams.has(id);
  }

  get(id: string): AnyDiagram | undefined {
    return this.diagrams.get(id);
  }

  recordAiCall(estimatedUsd: number = 0): void {
    this.aiCallCount += 1;
    this.estimatedCostUsd += estimatedUsd;
  }

  get callCount(): number {
    return this.aiCallCount;
  }

  get costUsd(): number {
    return this.estimatedCostUsd;
  }

  flush(rootSystemId: string): DiagramIndex {
    const entries: DiagramIndexEntry[] = [];
    const flows: { id: string; title: string; trigger: FlowTrigger }[] = [];
    const searchEntries: SearchEntryFile[] = [];
    const searchDiagrams: SearchIndexFile['diagrams'] = {};

    for (const d of this.diagrams.values()) {
      const file = resolve(diagramsSubdir(this.opts.outputDir), `${sanitizeId(d.id)}.json`);
      writeFileSync(file, JSON.stringify(d, null, 2), 'utf8');
      entries.push({
        id: d.id,
        kind: d.kind,
        level: d.level,
        title: d.title,
        parentId: d.parentId,
      });
      if (d.kind === 'flow' && d.level === 1) {
        flows.push({ id: d.id, title: d.title, trigger: (d as FlowDiagram).trigger });
      }
      searchDiagrams[d.id] = { title: d.title, kind: d.kind, level: d.level };
      collectSearchEntries(d, searchEntries);
    }
    const search: SearchIndexFile = { diagrams: searchDiagrams, entries: searchEntries };

    const index: DiagramIndex = {
      version: viszVersion(),
      generatedAt: new Date().toISOString(),
      generatedFor: this.opts.repoRoot,
      rootSystemId,
      flows,
      diagrams: entries,
      meta: {
        levels: this.opts.levels,
        flowsEnabled: this.opts.flowsEnabled,
        aiCallCount: this.aiCallCount,
        estimatedCostUsd: this.estimatedCostUsd || undefined,
      },
    };

    writeFileSync(indexFile(this.opts.outputDir), JSON.stringify(index, null, 2), 'utf8');
    writeFileSync(
      resolve(this.opts.outputDir, 'search.json'),
      JSON.stringify(search),
      'utf8',
    );
    writeFileSync(
      metaFile(this.opts.outputDir),
      JSON.stringify(
        {
          repoRoot: this.opts.repoRoot,
          generatedAt: index.generatedAt,
          version: index.version,
          levels: this.opts.levels,
          flowsEnabled: this.opts.flowsEnabled,
        },
        null,
        2,
      ),
      'utf8',
    );
    return index;
  }

  /** Helpers for callers that want to type-narrow what they're holding. */
  static isSystem(d: AnyDiagram): d is SystemDiagram {
    return d.kind === 'system';
  }
  static isFlow(d: AnyDiagram): d is FlowDiagram {
    return d.kind === 'flow';
  }
}

function collectSearchEntries(d: AnyDiagram, out: SearchEntryFile[]) {
  // The diagram itself is searchable.
  out.push({
    diagramId: d.id,
    kind: 'diagram',
    label: d.title,
    description: d.description,
    haystack: makeHaystack([d.title, d.description, d.kind, `level ${d.level}`]),
  });
  // Each component / step is searchable too.
  for (const n of d.nodes) {
    out.push({
      diagramId: d.id,
      anchor: n.id,
      kind: d.kind === 'flow' ? 'flow-step' : 'component',
      label: n.label,
      description: n.description,
      componentKind: n.kind,
      files: n.files.slice(0, 12),
      haystack: makeHaystack([n.label, n.description, n.kind, ...(n.files ?? []), d.title]),
    });
  }
}

function makeHaystack(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(' ').toLowerCase();
}
