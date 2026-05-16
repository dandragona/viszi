import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { traverse } from '../../src/analyzer/traverse.js';
import { parseFile } from '../../src/analyzer/parsers/index.js';
import { isCode } from '../../src/analyzer/languages.js';
import { detectEntrypoints } from '../../src/analyzer/entrypoints.js';

const FIXTURE = resolve(__dirname, '../fixtures/sample-repo');

describe('detectEntrypoints', () => {
  it('reads main + bin from package.json', async () => {
    const files = await traverse({ root: FIXTURE });
    const parsed = files
      .filter((f) => isCode(f.language))
      .map((f) => parseFile(f.abs, f.rel, f.language))
      .filter((p): p is NonNullable<typeof p> => p !== null);
    const eps = detectEntrypoints({ repoRoot: FIXTURE, parsed });
    const kinds = new Set(eps.map((e) => `${e.kind}:${e.file}`));
    expect(kinds.has('package-main:src/index.ts')).toBe(true);
    expect(kinds.has('package-bin:src/cli.ts')).toBe(true);
  });

  it('detects HTTP handlers from parsers', async () => {
    const files = await traverse({ root: FIXTURE });
    const parsed = files
      .filter((f) => isCode(f.language))
      .map((f) => parseFile(f.abs, f.rel, f.language))
      .filter((p): p is NonNullable<typeof p> => p !== null);
    const eps = detectEntrypoints({ repoRoot: FIXTURE, parsed });
    const http = eps.filter((e) => e.kind === 'http');
    expect(http.length).toBeGreaterThan(0);
    expect(http.some((e) => e.file === 'src/server.ts')).toBe(true);
  });

  it('flags filename-matched entrypoints (index/cli/main/server)', async () => {
    const files = await traverse({ root: FIXTURE });
    const parsed = files
      .filter((f) => isCode(f.language))
      .map((f) => parseFile(f.abs, f.rel, f.language))
      .filter((p): p is NonNullable<typeof p> => p !== null);
    const eps = detectEntrypoints({ repoRoot: FIXTURE, parsed });
    const initFiles = eps.filter((e) => e.kind === 'init').map((e) => e.file);
    expect(initFiles).toEqual(
      expect.arrayContaining(['src/index.ts', 'src/cli.ts', 'src/server.ts']),
    );
  });

  it('flags cron/worker filenames as cron entrypoints', async () => {
    const files = await traverse({ root: FIXTURE });
    const parsed = files
      .filter((f) => isCode(f.language))
      .map((f) => parseFile(f.abs, f.rel, f.language))
      .filter((p): p is NonNullable<typeof p> => p !== null);
    const eps = detectEntrypoints({ repoRoot: FIXTURE, parsed });
    const cron = eps.filter((e) => e.kind === 'cron');
    expect(cron.some((e) => e.file === 'scripts/worker.py')).toBe(true);
  });
});
