import { describe, it, expect } from 'vitest';
import { buildFileIndex, parseFileQuery, searchFiles, type SearchEntry } from '../../src/web/search';

const baseEntry = (over: Partial<SearchEntry>): SearchEntry => ({
  diagramId: 'sys-1',
  kind: 'component',
  diagramKind: 'system',
  diagramTitle: 'Root',
  diagramLevel: 1,
  label: 'Auth',
  haystack: 'auth',
  ...over,
});

describe('buildFileIndex', () => {
  it('groups locations by file path and dedupes (diagramId,anchor)', () => {
    const entries: SearchEntry[] = [
      baseEntry({ anchor: 'auth', files: ['src/auth/login.ts', 'src/auth/token.ts'] }),
      baseEntry({ anchor: 'auth', files: ['src/auth/login.ts'] }), // duplicate (sys-1, auth)
      baseEntry({
        diagramId: 'sys-2',
        diagramTitle: 'Users',
        anchor: 'users',
        label: 'Users',
        files: ['src/auth/login.ts'],
      }),
    ];
    const index = buildFileIndex(entries);
    const byPath = Object.fromEntries(index.map((f) => [f.path, f]));
    expect(byPath['src/auth/login.ts'].locations).toHaveLength(2);
    expect(byPath['src/auth/token.ts'].locations).toHaveLength(1);
  });

  it('skips entries with no files array', () => {
    const entries: SearchEntry[] = [baseEntry({ kind: 'diagram', label: 'Root' })];
    expect(buildFileIndex(entries)).toEqual([]);
  });
});

describe('searchFiles', () => {
  const index = buildFileIndex([
    baseEntry({ anchor: 'a', files: ['src/auth/login.ts'] }),
    baseEntry({ anchor: 'b', files: ['src/auth/login.tsx'] }),
    baseEntry({ anchor: 'c', files: ['src/users/profile.ts'] }),
  ]);

  it('returns matches by path substring', () => {
    const hits = searchFiles(index, 'auth');
    expect(hits.map((f) => f.path).sort()).toEqual(['src/auth/login.ts', 'src/auth/login.tsx']);
  });

  it('returns empty for no match', () => {
    expect(searchFiles(index, 'nonexistent')).toEqual([]);
  });

  it('returns full list (capped) for empty query', () => {
    expect(searchFiles(index, '').length).toBe(3);
  });
});

describe('parseFileQuery', () => {
  it('returns the trimmed query when prefixed with `f:`', () => {
    expect(parseFileQuery('f: src/auth ')).toBe('src/auth');
  });
  it('returns the query when it contains a `/`', () => {
    expect(parseFileQuery('src/auth/login.ts')).toBe('src/auth/login.ts');
  });
  it('returns null for non-file queries', () => {
    expect(parseFileQuery('auth')).toBeNull();
    expect(parseFileQuery('')).toBeNull();
  });
});
