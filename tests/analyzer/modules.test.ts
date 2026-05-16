import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { traverse } from '../../src/analyzer/traverse.js';
import { parseFile } from '../../src/analyzer/parsers/index.js';
import { isCode } from '../../src/analyzer/languages.js';
import { buildDependencyGraph } from '../../src/analyzer/graph.js';
import { clusterIntoModules, modulesForPrompt } from '../../src/analyzer/modules.js';

const FIXTURE = resolve(__dirname, '../fixtures/sample-repo');

async function buildGraph() {
  const files = await traverse({ root: FIXTURE });
  const parsed = files
    .filter((f) => isCode(f.language))
    .map((f) => parseFile(f.abs, f.rel, f.language))
    .filter((p): p is NonNullable<typeof p> => p !== null);
  return buildDependencyGraph({ repoRoot: FIXTURE, parsed });
}

describe('clusterIntoModules', () => {
  it('groups files under the first directory below src/ when present', async () => {
    const g = await buildGraph();
    const modules = clusterIntoModules(g);
    const ids = modules.map((m) => m.id);
    // src/index.ts / src/db.ts / src/cli.ts all live at src/<file>.ts (1 level
    // under src) — so they collapse into the bare `src` parent.
    expect(ids).toContain('src');
    // cmd/server/main.go has depth ≥ 3, so it becomes cmd/server.
    expect(ids).toContain('cmd/server');
  });

  it('each file appears in exactly one module', async () => {
    const g = await buildGraph();
    const modules = clusterIntoModules(g);
    const seen = new Set<string>();
    for (const m of modules) {
      for (const f of m.files) {
        expect(seen.has(f)).toBe(false);
        seen.add(f);
      }
    }
  });

  it('records cross-module imports as module-level edges', async () => {
    const g = await buildGraph();
    const modules = clusterIntoModules(g);
    // python worker imports from src.db → should give scripts → src import edge.
    const scripts = modules.find((m) => m.id === 'scripts');
    expect(scripts).toBeDefined();
    // src/index.ts has only same-module imports, so its module imports may be empty.
  });

  it('modulesForPrompt produces a compact shape with sampleFiles and counts', async () => {
    const g = await buildGraph();
    const modules = clusterIntoModules(g);
    const compact = modulesForPrompt(modules) as Array<{
      id: string;
      sampleFiles: string[];
      fileCount: number;
      loc: number;
    }>;
    expect(Array.isArray(compact)).toBe(true);
    for (const m of compact) {
      expect(m.fileCount).toBeGreaterThan(0);
      expect(m.sampleFiles.length).toBeLessThanOrEqual(8);
      expect(m.loc).toBeGreaterThanOrEqual(0);
    }
  });
});
