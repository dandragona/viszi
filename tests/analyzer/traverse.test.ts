import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { traverse } from '../../src/analyzer/traverse.js';

const FIXTURE = resolve(__dirname, '../fixtures/sample-repo');

// Files we write at setup that traverse must filter out. These paths can't
// live in git because the repo-level .gitignore excludes node_modules/, build/, etc.
const VOLATILE = [
  resolve(FIXTURE, 'node_modules/dep/index.ts'),
  resolve(FIXTURE, 'build/should-be-ignored.ts'),
  resolve(FIXTURE, '.viszi/cache/old.json'),
];

beforeAll(() => {
  for (const f of VOLATILE) {
    mkdirSync(resolve(f, '..'), { recursive: true });
    writeFileSync(f, '// should be excluded\nexport const x = 1;\n');
  }
});

afterAll(() => {
  // Clean up the ALWAYS_EXCLUDE shaped dirs we created for the test.
  for (const dir of ['node_modules', 'build', '.viszi']) {
    const p = resolve(FIXTURE, dir);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
});

describe('traverse', () => {
  it('discovers the legitimate source files in the fixture', async () => {
    const files = await traverse({ root: FIXTURE });
    const rels = files.map((f) => f.rel.replace(/\\/g, '/')).sort();
    expect(rels).toContain('src/index.ts');
    expect(rels).toContain('src/db.ts');
    expect(rels).toContain('src/server.ts');
    expect(rels).toContain('src/cli.ts');
    expect(rels).toContain('scripts/worker.py');
    expect(rels).toContain('cmd/server/main.go');
  });

  it('excludes anything under ALWAYS_EXCLUDE (node_modules, build, .viszi)', async () => {
    const files = await traverse({ root: FIXTURE });
    const rels = files.map((f) => f.rel.replace(/\\/g, '/'));
    expect(rels.some((r) => r.startsWith('node_modules/'))).toBe(false);
    expect(rels.some((r) => r.startsWith('build/'))).toBe(false);
    expect(rels.some((r) => r.startsWith('.viszi/'))).toBe(false);
  });

  it('honours .gitignore (secret.local is in the fixture .gitignore)', async () => {
    const files = await traverse({ root: FIXTURE });
    const rels = files.map((f) => f.rel.replace(/\\/g, '/'));
    expect(rels).not.toContain('secret.local');
  });

  it('honours extraExcludes globs', async () => {
    const files = await traverse({ root: FIXTURE, extraExcludes: ['scripts/**'] });
    const rels = files.map((f) => f.rel.replace(/\\/g, '/'));
    expect(rels.some((r) => r.startsWith('scripts/'))).toBe(false);
    expect(rels).toContain('src/index.ts');
  });

  it('respects the MAX_FILE_BYTES size cap', async () => {
    const big = resolve(FIXTURE, 'src/big.ts');
    try {
      // 1.5 MB > MAX_FILE_BYTES (1 MB)
      writeFileSync(big, '// ' + 'a'.repeat(1_500_000));
      const files = await traverse({ root: FIXTURE });
      const rels = files.map((f) => f.rel.replace(/\\/g, '/'));
      expect(rels).not.toContain('src/big.ts');
    } finally {
      if (existsSync(big)) rmSync(big);
    }
  });

  it('limits discovery to includeOnly globs when provided', async () => {
    const files = await traverse({ root: FIXTURE, includeOnly: ['src/**'] });
    const rels = files.map((f) => f.rel.replace(/\\/g, '/'));
    expect(rels.every((r) => r.startsWith('src/'))).toBe(true);
    expect(rels.some((r) => r.startsWith('cmd/'))).toBe(false);
  });
});
