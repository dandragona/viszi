import { describe, it, expect } from 'vitest';
import { hydrateSearch, type SearchIndexFile, type SearchEntry } from '../../src/web/search';

describe('hydrateSearch', () => {
  it('joins entries against the deduped diagram map', () => {
    const input: SearchIndexFile = {
      diagrams: {
        'sys-1': { title: 'Root System', kind: 'system', level: 1 },
        'flow-1': { title: 'Boot Flow', kind: 'flow', level: 1 },
      },
      entries: [
        { diagramId: 'sys-1', kind: 'diagram', label: 'Root System', haystack: 'root system' },
        {
          diagramId: 'sys-1',
          anchor: 'node-a',
          kind: 'component',
          label: 'Auth',
          componentKind: 'service',
          haystack: 'auth',
        },
        { diagramId: 'flow-1', kind: 'diagram', label: 'Boot Flow', haystack: 'boot flow' },
      ],
    };
    const result = hydrateSearch(input);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      diagramTitle: 'Root System',
      diagramKind: 'system',
      diagramLevel: 1,
      label: 'Root System',
    });
    expect(result[1]).toMatchObject({
      diagramTitle: 'Root System',
      diagramKind: 'system',
      componentKind: 'service',
      anchor: 'node-a',
    });
    expect(result[2]).toMatchObject({
      diagramTitle: 'Boot Flow',
      diagramKind: 'flow',
    });
  });

  it('passes legacy flat-array input through unchanged', () => {
    const flat: SearchEntry[] = [
      {
        diagramId: 'x',
        kind: 'diagram',
        diagramKind: 'system',
        diagramTitle: 'X',
        diagramLevel: 1,
        label: 'X',
        haystack: 'x',
      },
    ];
    const result = hydrateSearch(flat);
    expect(result).toEqual(flat);
  });

  it('falls back gracefully when an entry references a missing diagram id', () => {
    const input: SearchIndexFile = {
      diagrams: {},
      entries: [{ diagramId: 'orphan', kind: 'diagram', label: 'Lost', haystack: 'lost' }],
    };
    const result = hydrateSearch(input);
    expect(result[0]).toMatchObject({
      diagramTitle: 'orphan',
      diagramKind: 'system',
      diagramLevel: 1,
    });
  });

  it('returns an empty list for empty / malformed input', () => {
    expect(hydrateSearch(undefined)).toEqual([]);
    expect(hydrateSearch({})).toEqual([]);
    expect(hydrateSearch({ diagrams: {} })).toEqual([]);
  });
});
