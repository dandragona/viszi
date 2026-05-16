import { describe, it, expect } from 'vitest';
import Graph from 'graphology';
import { clusterIntoModules, FILES_PER_MODULE_LIMIT } from '../../src/analyzer/modules.js';
import type { DependencyGraph } from '../../src/analyzer/graph.js';

function makeFakeGraph(files: string[]): DependencyGraph {
  const g = new Graph({ multi: false, type: 'directed' }) as unknown as DependencyGraph;
  for (const rel of files) {
    g.addNode(rel, { kind: 'file', loc: 10, exportedSymbols: [], httpHandlerCount: 0 });
  }
  return g;
}

describe('clusterIntoModules — adaptive depth (#8 better fix)', () => {
  it('descends one level deeper when a depth-2 bucket would exceed the limit', () => {
    // Build a fixture mimicking single-package-repo shape: `src/app/<subpkg>/<file>.ts`
    // with enough files in `src/app/` that the depth-2 rule alone would lump
    // them all into one module.
    const subpkgs = ['cli', 'api', 'data', 'workers', 'jobs', 'web'];
    const files: string[] = [];
    for (const sub of subpkgs) {
      // 5 files per sub-package → 30 total, > FILES_PER_MODULE_LIMIT.
      for (let i = 0; i < 5; i++) files.push(`src/app/${sub}/file${i}.ts`);
    }
    expect(files.length).toBeGreaterThan(FILES_PER_MODULE_LIMIT);

    const g = makeFakeGraph(files);
    const mods = clusterIntoModules(g);
    const ids = mods.map((m) => m.id).sort();

    // Before the fix, all files collapsed to `src/app`. After the fix, each
    // sub-package becomes its own module.
    for (const sub of subpkgs) {
      expect(ids).toContain(`src/app/${sub}`);
    }
    expect(ids).not.toContain('src/app');
  });

  it('leaves small buckets at depth 2 alone', () => {
    // Only a handful of files under src/app — stays as `src/app`.
    const files = ['src/app/a.ts', 'src/app/b.ts', 'src/app/c.ts'];
    const g = makeFakeGraph(files);
    const mods = clusterIntoModules(g);
    const ids = mods.map((m) => m.id);
    expect(ids).toContain('src/app');
  });
});
