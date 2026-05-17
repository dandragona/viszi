import { describe, it, expect } from 'vitest';

// Re-implement the tiny pure helpers here so we can test them without a DOM.
// Keep this in sync with `parseHashParams`, `parseHideHash`, `parseExpandHash`,
// `writeHashParam`, and `writeHideHash` in DiagramCanvas.tsx.
function parseHashParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.length > 1 ? hash.slice(1) : '');
}

function parseHideHash(hash: string): Set<string> {
  const raw = parseHashParams(hash).get('hide');
  if (!raw) return new Set();
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

function parseExpandHash(hash: string): string | undefined {
  return parseHashParams(hash).get('expand') ?? undefined;
}

function writeHashParam(currentHash: string, key: string, value: string | undefined): string {
  const params = parseHashParams(currentHash);
  if (!value) params.delete(key);
  else params.set(key, value);
  const out = params.toString();
  return out ? `#${out}` : '';
}

function writeHideHash(currentHash: string, hidden: Set<string>): string {
  return writeHashParam(currentHash, 'hide', hidden.size === 0 ? undefined : Array.from(hidden).join(','));
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

describe('expand hash helpers (009 #4 inline sub-flow expansion)', () => {
  it('parses empty hash to undefined', () => {
    expect(parseExpandHash('')).toBeUndefined();
    expect(parseExpandHash('#')).toBeUndefined();
    expect(parseExpandHash('#hide=a')).toBeUndefined();
  });

  it('parses expand=<stepId> to the step id', () => {
    expect(parseExpandHash('#expand=flow.abc.s3')).toBe('flow.abc.s3');
  });

  it('coexists with hide=', () => {
    const hash = '#hide=a,b&expand=flow.x.s1';
    expect(parseExpandHash(hash)).toBe('flow.x.s1');
    expect(parseHideHash(hash)).toEqual(new Set(['a', 'b']));
  });

  it('writeHashParam toggles a key without disturbing siblings', () => {
    // Set expand on a hash that already has hide.
    const after = writeHashParam('#hide=a,b', 'expand', 'flow.x.s1');
    expect(after).toMatch(/hide=a%2Cb|hide=a,b/);
    expect(after).toMatch(/expand=flow.x.s1/);
    // Now clear expand — hide should survive.
    const cleared = writeHashParam(after, 'expand', undefined);
    expect(cleared).not.toMatch(/expand/);
    expect(cleared).toMatch(/hide/);
  });

  it('clears the entire hash when the last param is removed', () => {
    expect(writeHashParam('#expand=flow.x.s1', 'expand', undefined)).toBe('');
  });

  it('round-trips through writeHashParam → parseExpandHash', () => {
    const written = writeHashParam('', 'expand', 'flow.x.s7');
    expect(parseExpandHash(written)).toBe('flow.x.s7');
  });
});
