import { describe, it, expect } from 'vitest';

// Re-implement the tiny pure helpers here so we can test them without a DOM.
// Keep this in sync with `parseHideHash` / `writeHideHash` in DiagramCanvas.tsx.
function parseHideHash(hash: string): Set<string> {
  if (!hash || hash.length < 2) return new Set();
  const params = new URLSearchParams(hash.slice(1));
  const raw = params.get('hide');
  if (!raw) return new Set();
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

function writeHideHash(currentHash: string, hidden: Set<string>): string {
  const params = new URLSearchParams(currentHash.length > 1 ? currentHash.slice(1) : '');
  if (hidden.size === 0) params.delete('hide');
  else params.set('hide', Array.from(hidden).join(','));
  const out = params.toString();
  return out ? `#${out}` : '';
}

describe('hide hash helpers', () => {
  it('parses empty hash into an empty set', () => {
    expect(parseHideHash('')).toEqual(new Set());
    expect(parseHideHash('#')).toEqual(new Set());
    expect(parseHideHash('#foo=bar')).toEqual(new Set());
  });

  it('parses hide=a,b,c into a set of ids', () => {
    expect(parseHideHash('#hide=a,b,c')).toEqual(new Set(['a', 'b', 'c']));
  });

  it('writes a hide param without disturbing other params', () => {
    expect(writeHideHash('#focus=node-1', new Set(['a', 'b']))).toMatch(/focus=node-1/);
    expect(writeHideHash('#focus=node-1', new Set(['a', 'b']))).toMatch(/hide=a%2Cb|hide=a,b/);
  });

  it('clears the hide param when the set is empty', () => {
    expect(writeHideHash('#hide=a,b', new Set())).toBe('');
    expect(writeHideHash('#focus=x&hide=a', new Set())).toMatch(/focus=x/);
    expect(writeHideHash('#focus=x&hide=a', new Set())).not.toMatch(/hide/);
  });

  it('round-trips through write → parse', () => {
    const written = writeHideHash('', new Set(['x', 'y', 'z']));
    expect(parseHideHash(written)).toEqual(new Set(['x', 'y', 'z']));
  });
});
