import { relative } from 'node:path';
import { createRequire } from 'node:module';
import type { default as GraphCtor, DirectedGraph as DirectedGraphType } from 'graphology';
import type { ParsedFile } from './parsers/index.js';
import { resolveImport } from './resolve.js';

// graphology is a CJS module; importing named exports via ESM fails at runtime.
// Use createRequire to get the constructor, while keeping the named type for typing.
const require = createRequire(import.meta.url);
const graphology = require('graphology') as {
  default: typeof GraphCtor;
  DirectedGraph: typeof DirectedGraphType;
};
const DirectedGraph = graphology.DirectedGraph ?? graphology.default;

export interface FileNodeAttrs {
  rel: string;
  abs: string;
  language: string;
  loc: number;
  symbolCount: number;
  exportedSymbols: string[];
  httpHandlerCount: number;
}

export interface DepEdgeAttrs {
  /** Number of import statements from source → target. */
  importCount: number;
  /** Number of distinct call sites in source that hit an exported name from target. */
  callCount: number;
  /** Backwards-compat alias kept for older readers. */
  weight: number;
  /** Dominant relationship kind for rendering. */
  kind: 'imports' | 'calls' | 'imports+calls';
  external: boolean;
}

export type DependencyGraph = DirectedGraphType<FileNodeAttrs, DepEdgeAttrs>;

export interface BuildOpts {
  repoRoot: string;
  parsed: ParsedFile[];
}

/** Build a directed graph: nodes = files, edges = resolved imports. */
export function buildDependencyGraph(opts: BuildOpts): DependencyGraph {
  const { repoRoot, parsed } = opts;
  const g = new DirectedGraph({ multi: false }) as DependencyGraph;

  for (const p of parsed) {
    const id = p.rel;
    if (!g.hasNode(id)) {
      g.addNode(id, {
        rel: p.rel,
        abs: p.abs,
        language: p.language,
        loc: p.loc,
        symbolCount: p.symbols.length,
        exportedSymbols: p.symbols.filter((s) => s.exported).map((s) => s.name),
        httpHandlerCount: p.httpHandlers.length,
      });
    }
  }

  // Helper: bump an edge's import or call counter.
  const bump = (sourceId: string, targetRel: string, field: 'importCount' | 'callCount') => {
    if (sourceId === targetRel) return;
    const edgeKey = `${sourceId}->${targetRel}`;
    if (g.hasEdge(edgeKey)) {
      g.updateEdgeAttributes(edgeKey, (attrs: DepEdgeAttrs) => {
        const next: DepEdgeAttrs = { ...attrs, [field]: (attrs[field] ?? 0) + 1 } as DepEdgeAttrs;
        next.weight = next.importCount + next.callCount;
        next.kind = deriveEdgeKind(next.importCount, next.callCount);
        return next;
      });
    } else {
      const importCount = field === 'importCount' ? 1 : 0;
      const callCount = field === 'callCount' ? 1 : 0;
      g.addEdgeWithKey(edgeKey, sourceId, targetRel, {
        importCount,
        callCount,
        weight: importCount + callCount,
        kind: deriveEdgeKind(importCount, callCount),
        external: false,
      });
    }
  };

  // Resolve every import once and remember the resolved target so callsites can reuse it.
  const importResolutionByFile = new Map<string, Map<string, string>>();
  for (const p of parsed) {
    const local = new Map<string, string>();
    importResolutionByFile.set(p.rel, local);
    for (const imp of p.imports) {
      const resolved = resolveImport({
        raw: imp.raw,
        fromFile: p.abs,
        repoRoot,
        language: p.language,
      });
      if (!resolved) continue;
      const targetRel = relative(repoRoot, resolved);
      if (!g.hasNode(targetRel)) continue;
      local.set(imp.raw, targetRel);
      bump(p.rel, targetRel, 'importCount');
    }
  }

  // Wire call edges using the per-file resolution map.
  for (const p of parsed) {
    const localImports = importResolutionByFile.get(p.rel);
    if (!localImports) continue;
    for (const cs of p.callsites) {
      if (!cs.fromImport) continue;
      const targetRel = localImports.get(cs.fromImport);
      if (!targetRel) continue;
      bump(p.rel, targetRel, 'callCount');
    }
  }

  return g;
}

function deriveEdgeKind(imports: number, calls: number): DepEdgeAttrs['kind'] {
  if (imports > 0 && calls > 0) return 'imports+calls';
  if (calls > 0) return 'calls';
  return 'imports';
}

/** Total LOC + file count summary, useful for AI prompt context. */
export function summarize(graph: DependencyGraph): { files: number; loc: number; edges: number } {
  let loc = 0;
  graph.forEachNode((_id: string, attrs: FileNodeAttrs) => {
    loc += attrs.loc ?? 0;
  });
  return {
    files: graph.order,
    loc,
    edges: graph.size,
  };
}
