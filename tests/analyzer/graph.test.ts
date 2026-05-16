import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { traverse } from '../../src/analyzer/traverse.js';
import { parseFile } from '../../src/analyzer/parsers/index.js';
import { isCode } from '../../src/analyzer/languages.js';
import { buildDependencyGraph, summarize } from '../../src/analyzer/graph.js';

const FIXTURE = resolve(__dirname, '../fixtures/sample-repo');

async function parsedFiles() {
  const all = await traverse({ root: FIXTURE });
  return all
    .filter((f) => isCode(f.language))
    .map((f) => parseFile(f.abs, f.rel, f.language))
    .filter((p): p is NonNullable<typeof p> => p !== null);
}

describe('buildDependencyGraph', () => {
  it('builds nodes for every parsed file', async () => {
    const parsed = await parsedFiles();
    const g = buildDependencyGraph({ repoRoot: FIXTURE, parsed });
    const ids = g.nodes();
    expect(ids).toContain('src/index.ts');
    expect(ids).toContain('src/db.ts');
    expect(ids).toContain('src/server.ts');
  });

  it('resolves relative imports into edges with importCount ≥ 1', async () => {
    const parsed = await parsedFiles();
    const g = buildDependencyGraph({ repoRoot: FIXTURE, parsed });
    // index.ts imports both db.ts and server.ts
    expect(g.hasEdge('src/index.ts->src/db.ts')).toBe(true);
    expect(g.hasEdge('src/index.ts->src/server.ts')).toBe(true);
    const attrs = g.getEdgeAttributes('src/index.ts->src/db.ts');
    expect(attrs.importCount).toBeGreaterThan(0);
    expect(attrs.kind === 'imports' || attrs.kind === 'imports+calls').toBe(true);
  });

  it('records call edges when an imported binding is invoked', async () => {
    const parsed = await parsedFiles();
    const g = buildDependencyGraph({ repoRoot: FIXTURE, parsed });
    // server.ts imports db and calls db.query — but `db` is a member access,
    // not a direct call of `db()`. Use index.ts → server.ts which calls startServer().
    const edge = 'src/index.ts->src/server.ts';
    expect(g.hasEdge(edge)).toBe(true);
    const attrs = g.getEdgeAttributes(edge);
    expect(attrs.callCount).toBeGreaterThan(0);
    expect(attrs.kind).toBe('imports+calls');
  });

  it('summarize reports node + edge counts', async () => {
    const parsed = await parsedFiles();
    const g = buildDependencyGraph({ repoRoot: FIXTURE, parsed });
    const s = summarize(g);
    expect(s.files).toBeGreaterThan(0);
    expect(s.edges).toBeGreaterThan(0);
    expect(s.loc).toBeGreaterThan(0);
  });
});
