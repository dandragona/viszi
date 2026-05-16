import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInitCommand } from '../../src/cli/commands/init.js';
import { stripJsonComments } from '../../src/cli/config.js';

let tmp: string;
let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'viszi-init-'));
  // Logger.error always writes to stderr (errors stay visible even in --quiet
  // mode by design). In tests we don't want that leaking into vitest output.
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  errSpy.mockRestore();
});

describe('viszi init', () => {
  it('writes .viszi.json when the file does not exist', async () => {
    const code = await runInitCommand({ path: tmp, quiet: true });
    expect(code).toBe(0);
    expect(existsSync(join(tmp, '.viszi.json'))).toBe(true);
    const body = readFileSync(join(tmp, '.viszi.json'), 'utf8');
    expect(body).toMatch(/^\/\//); // starts with a // header comment
  });

  it('the emitted template parses (after comment-stripping) and is a valid empty config', async () => {
    await runInitCommand({ path: tmp, quiet: true });
    const body = readFileSync(join(tmp, '.viszi.json'), 'utf8');
    const stripped = stripJsonComments(body);
    const parsed = JSON.parse(stripped);
    expect(typeof parsed).toBe('object');
    // All fields are commented out → empty object after stripping.
    expect(Object.keys(parsed)).toEqual([]);
  });

  it('refuses to overwrite an existing .viszi.json without --force', async () => {
    writeFileSync(join(tmp, '.viszi.json'), '{"include":["src/**"]}', 'utf8');
    const code = await runInitCommand({ path: tmp, quiet: true });
    expect(code).toBe(1);
    // File preserved.
    expect(readFileSync(join(tmp, '.viszi.json'), 'utf8')).toContain('src/**');
  });

  it('overwrites with --force', async () => {
    const original = '{"include":["preserved-marker/**"]}';
    writeFileSync(join(tmp, '.viszi.json'), original, 'utf8');
    const code = await runInitCommand({ path: tmp, force: true, quiet: true });
    expect(code).toBe(0);
    const body = readFileSync(join(tmp, '.viszi.json'), 'utf8');
    expect(body).not.toContain('preserved-marker');
    // The fresh template header is present.
    expect(body).toMatch(/^\/\/ viszi config/);
  });

  it('writes .viszi-ignore when --with-ignore is passed', async () => {
    const code = await runInitCommand({ path: tmp, withIgnore: true, quiet: true });
    expect(code).toBe(0);
    expect(existsSync(join(tmp, '.viszi-ignore'))).toBe(true);
  });

  it('preserves an existing .viszi-ignore without --force', async () => {
    writeFileSync(join(tmp, '.viszi-ignore'), 'fixtures/**\n', 'utf8');
    await runInitCommand({ path: tmp, withIgnore: true, quiet: true });
    expect(readFileSync(join(tmp, '.viszi-ignore'), 'utf8')).toBe('fixtures/**\n');
  });
});

describe('stripJsonComments', () => {
  it('strips // line comments', () => {
    const out = stripJsonComments('{\n  // hi\n  "a": 1\n}');
    expect(JSON.parse(out)).toEqual({ a: 1 });
  });

  it('strips /* block */ comments', () => {
    const out = stripJsonComments('{ /* skip me */ "x": 2 }');
    expect(JSON.parse(out)).toEqual({ x: 2 });
  });

  it('does not strip slashes inside string literals', () => {
    const out = stripJsonComments('{ "url": "https://example.com/path" }');
    expect(JSON.parse(out)).toEqual({ url: 'https://example.com/path' });
  });

  it('does not strip // inside a string with embedded quotes', () => {
    const out = stripJsonComments('{ "s": "this // is not a comment" }');
    expect(JSON.parse(out)).toEqual({ s: 'this // is not a comment' });
  });

  it('handles escaped quotes in strings', () => {
    const out = stripJsonComments('{ "q": "a\\"b // x" }');
    expect(JSON.parse(out)).toEqual({ q: 'a"b // x' });
  });
});
