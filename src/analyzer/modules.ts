import { sep } from 'node:path';
import type { DependencyGraph, FileNodeAttrs, DepEdgeAttrs } from './graph.js';

export interface Module {
  id: string;
  path: string;
  files: string[];
  loc: number;
  exportedSymbols: string[];
  httpHandlerCount: number;
  /** Imports from this module to other modules (module-level edges). */
  imports: Set<string>;
  /** Call relationships from this module to other modules (separate signal from imports). */
  calls: Set<string>;
}

/**
 * Collapse files into modules. Strategy:
 * 1. If a file lives under a recognised top-level dir (src/, lib/, app/, internal/, pkg/),
 *    its module is the dir 1 level under that.
 * 2. Otherwise, the module is its top-level dir.
 * 3. Files at the very root get their own "root" module.
 * 4. **Adaptive depth**: if the initial bucket would contain more than
 *    `FILES_PER_MODULE_LIMIT` files, descend one level deeper. This prevents
 *    `src/<one-package>/...` repos from collapsing into a single giant module
 *    (#8 in 007_Post_Launch_TODO).
 */
const TOP_LEVEL_PASSTHROUGH = new Set(['src', 'lib', 'app', 'internal', 'pkg', 'cmd', 'apps', 'packages']);

/** Tunable: when a module would have more files than this, refine into sub-buckets. */
export const FILES_PER_MODULE_LIMIT = 25;

function moduleIdFor(rel: string, scopePrefix?: string): string {
  let path = rel;
  if (scopePrefix && path.startsWith(scopePrefix)) {
    path = path.slice(scopePrefix.length).replace(/^[/\\]+/, '');
  }
  const parts = path.split(sep).filter(Boolean);
  if (parts.length === 0) return '__root__';
  if (parts.length === 1) return '__root__';

  if (TOP_LEVEL_PASSTHROUGH.has(parts[0]) && parts.length >= 3) {
    return parts.slice(0, 2).join('/');
  }
  return parts[0];
}

/** Try to push one segment deeper than `moduleIdFor` for adaptive refinement. */
function moduleIdForDeeper(rel: string, scopePrefix?: string): string {
  let path = rel;
  if (scopePrefix && path.startsWith(scopePrefix)) {
    path = path.slice(scopePrefix.length).replace(/^[/\\]+/, '');
  }
  const parts = path.split(sep).filter(Boolean);
  if (parts.length === 0) return '__root__';
  if (parts.length === 1) return '__root__';

  if (TOP_LEVEL_PASSTHROUGH.has(parts[0]) && parts.length >= 4) {
    return parts.slice(0, 3).join('/');
  }
  if (parts.length >= 3) {
    return parts.slice(0, 2).join('/');
  }
  return moduleIdFor(rel, scopePrefix);
}

/** Choose an effective moduleId, descending when the initial bucket is too big. */
function pickModuleId(rel: string, counts: Map<string, number>, scopePrefix?: string): string {
  const initial = moduleIdFor(rel, scopePrefix);
  if ((counts.get(initial) ?? 0) <= FILES_PER_MODULE_LIMIT) return initial;
  const deeper = moduleIdForDeeper(rel, scopePrefix);
  return deeper === initial ? initial : deeper;
}

export function clusterIntoModules(graph: DependencyGraph, scopePrefix?: string): Module[] {
  // Pre-pass: count files per coarse moduleId so we can detect oversized buckets.
  const counts = new Map<string, number>();
  graph.forEachNode((id: string) => {
    const mid = moduleIdFor(id, scopePrefix);
    counts.set(mid, (counts.get(mid) ?? 0) + 1);
  });

  const modules = new Map<string, Module>();

  graph.forEachNode((id: string, attrs: FileNodeAttrs) => {
    const modId = pickModuleId(id, counts, scopePrefix);
    let mod = modules.get(modId);
    if (!mod) {
      mod = {
        id: modId,
        path: modId === '__root__' ? '.' : modId,
        files: [],
        loc: 0,
        exportedSymbols: [],
        httpHandlerCount: 0,
        imports: new Set<string>(),
        calls: new Set<string>(),
      };
      modules.set(modId, mod);
    }
    mod.files.push(id);
    mod.loc += attrs.loc ?? 0;
    mod.httpHandlerCount += attrs.httpHandlerCount ?? 0;
    for (const sym of attrs.exportedSymbols ?? []) {
      if (mod.exportedSymbols.length < 32) mod.exportedSymbols.push(sym);
    }
  });

  graph.forEachEdge((_e: string, attrs: DepEdgeAttrs, source: string, target: string) => {
    const sm = pickModuleId(source, counts, scopePrefix);
    const tm = pickModuleId(target, counts, scopePrefix);
    if (sm === tm) return;
    const mod = modules.get(sm);
    if (!mod) return;
    if ((attrs.importCount ?? 0) > 0) mod.imports.add(tm);
    if ((attrs.callCount ?? 0) > 0) mod.calls.add(tm);
  });

  return Array.from(modules.values()).sort((a, b) => b.loc - a.loc);
}

/** Reduce a module list down to a compact JSON shape suitable for an AI prompt. */
export function modulesForPrompt(modules: Module[], maxFilesPerModule = 8): unknown {
  return modules.map((m) => ({
    id: m.id,
    path: m.path,
    fileCount: m.files.length,
    loc: m.loc,
    sampleFiles: m.files.slice(0, maxFilesPerModule),
    httpHandlers: m.httpHandlerCount,
    exportsSample: m.exportedSymbols.slice(0, 12),
    importsModules: Array.from(m.imports),
    callsModules: Array.from(m.calls),
  }));
}
