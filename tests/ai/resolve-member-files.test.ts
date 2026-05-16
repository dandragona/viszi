import { describe, it, expect } from 'vitest';
import { resolveMemberFiles } from '../../src/ai/orchestrator.js';
import type { Module } from '../../src/analyzer/modules.js';

function makeModule(id: string, files: string[]): Module {
  return {
    id,
    path: id,
    files,
    loc: files.length * 10,
    exportedSymbols: [],
    httpHandlerCount: 0,
    imports: new Set(),
    calls: new Set(),
  };
}

describe('resolveMemberFiles (#8 fallback)', () => {
  it('exact match returns the module files', () => {
    const m = makeModule('app', ['src/app/a.ts', 'src/app/b.ts']);
    const got = resolveMemberFiles('app', [m], new Map([['app', m]]), 'src');
    expect(got).toEqual(['src/app/a.ts', 'src/app/b.ts']);
  });

  it('refines into a coarser parent module when Claude returns a deeper path', () => {
    // Analyzer produced a single "app" module; Claude said `app/cli`.
    const parent = makeModule('app', [
      'src/app/cli/main.ts',
      'src/app/cli/runner.ts',
      'src/app/api/server.ts',
      'src/app/data/db.ts',
    ]);
    const byId = new Map([['app', parent]]);
    const got = resolveMemberFiles('app/cli', [parent], byId, 'src');
    expect(got.sort()).toEqual(['src/app/cli/main.ts', 'src/app/cli/runner.ts']);
  });

  it('unions child modules when Claude returns a coarser id than the analyzer did', () => {
    const cli = makeModule('app/cli', ['src/app/cli/main.ts']);
    const api = makeModule('app/api', ['src/app/api/server.ts']);
    const byId = new Map([
      ['app/cli', cli],
      ['app/api', api],
    ]);
    const got = resolveMemberFiles('app', [cli, api], byId, 'src');
    expect(got.sort()).toEqual(['src/app/api/server.ts', 'src/app/cli/main.ts']);
  });

  it('returns [] when nothing matches', () => {
    const m = makeModule('app', ['src/app/a.ts']);
    const got = resolveMemberFiles('nope', [m], new Map([['app', m]]), 'src');
    expect(got).toEqual([]);
  });

  it('works at root scope (scope="")', () => {
    const parent = makeModule('app', ['app/cli/main.ts', 'app/api/server.ts']);
    const byId = new Map([['app', parent]]);
    const got = resolveMemberFiles('app/cli', [parent], byId, '');
    expect(got).toEqual(['app/cli/main.ts']);
  });
});
