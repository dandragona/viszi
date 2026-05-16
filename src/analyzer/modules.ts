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
 */
const TOP_LEVEL_PASSTHROUGH = new Set(['src', 'lib', 'app', 'internal', 'pkg', 'cmd', 'apps', 'packages']);

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

export function clusterIntoModules(graph: DependencyGraph, scopePrefix?: string): Module[] {
  const modules = new Map<string, Module>();

  graph.forEachNode((id: string, attrs: FileNodeAttrs) => {
    const modId = moduleIdFor(id, scopePrefix);
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
    const sm = moduleIdFor(source, scopePrefix);
    const tm = moduleIdFor(target, scopePrefix);
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
