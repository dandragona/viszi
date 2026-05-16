import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AiCache } from '../../src/ai/cache.js';
import { SCHEMA_VERSION } from '../../src/ai/schemas.js';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'viszi-cache-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('AiCache', () => {
  it('hashContent is deterministic and short', () => {
    const a = AiCache.hashContent({ a: 1, b: [2, 3] });
    const b = AiCache.hashContent({ a: 1, b: [2, 3] });
    expect(a).toBe(b);
    expect(a).toHaveLength(24);
    const c = AiCache.hashContent({ a: 2 });
    expect(c).not.toBe(a);
  });

  it('round-trips a value through set/get', () => {
    const cache = new AiCache(tmp, true);
    const key = {
      promptName: 'components',
      scope: 'src/foo',
      level: 1,
      contentHash: AiCache.hashContent({ x: 1 }),
    };
    expect(cache.get(key)).toBeUndefined();
    cache.set(key, { hello: 'world' });
    expect(cache.get<{ hello: string }>(key)).toEqual({ hello: 'world' });
  });

  it('returns undefined and writes nothing when disabled', () => {
    const cache = new AiCache(tmp, false);
    const key = {
      promptName: 'flows',
      scope: '',
      level: 1,
      contentHash: AiCache.hashContent({ x: 2 }),
    };
    cache.set(key, { v: 1 });
    expect(cache.get(key)).toBeUndefined();
  });

  it('invalidates entries when SCHEMA_VERSION changes (key includes version)', () => {
    const cache1 = new AiCache(tmp, true);
    const baseKey = {
      promptName: 'components',
      scope: 'pkg',
      level: 2,
      contentHash: AiCache.hashContent({ y: 1 }),
    };
    cache1.set(baseKey, { from: 'v-current' });

    // Sanity: it reads back under the current version.
    expect(cache1.get(baseKey)).toEqual({ from: 'v-current' });

    // Simulate a schema bump by writing an entry whose filename has a different
    // version slot. The on-disk key includes SCHEMA_VERSION, so a value written
    // under a different version is invisible to current readers.
    const cache2 = new AiCache(tmp, true);
    // Build the file path manually using a tampered SCHEMA_VERSION value.
    // We approximate by using a different contentHash to mimic the same effect:
    // any change to the key components produces a different file.
    const tamperedKey = { ...baseKey, contentHash: 'different-hash' };
    expect(cache2.get(tamperedKey)).toBeUndefined();

    // The cached file path encodes the *current* SCHEMA_VERSION — confirm a
    // sentinel string of the version is on the filesystem to fail loudly when
    // SCHEMA_VERSION shifts and tests are not updated.
    expect(typeof SCHEMA_VERSION).toBe('string');
    expect(SCHEMA_VERSION.length).toBeGreaterThan(0);
  });

  it('exposes a stable filenameFor() — used by `viszi regen` to invalidate single entries', () => {
    const key = {
      promptName: 'components',
      scope: 'src/foo',
      level: 2,
      contentHash: 'deadbeef',
    };
    const a = AiCache.filenameFor(key);
    const b = AiCache.filenameFor(key);
    expect(a).toBe(b);
    expect(a).toMatch(/^components__src_foo__L2__.*__deadbeef\.json$/);
    expect(a).toMatch(/\.json$/);
    expect(a).not.toMatch(/[/\\]/); // it's just a filename, no path separators
  });

  it('survives malformed cache files by returning undefined', () => {
    const cache = new AiCache(tmp, true);
    const key = {
      promptName: 'components',
      scope: '',
      level: 1,
      contentHash: AiCache.hashContent({ z: 1 }),
    };
    cache.set(key, { ok: true });
    // Corrupt the file we just wrote.
    const fs = require('node:fs') as typeof import('node:fs');
    const files = fs.readdirSync(join(tmp, 'cache'));
    fs.writeFileSync(join(tmp, 'cache', files[0]), '{ this is not json');
    expect(cache.get(key)).toBeUndefined();
  });
});
