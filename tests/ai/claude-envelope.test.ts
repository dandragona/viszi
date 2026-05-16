import { describe, it, expect } from 'vitest';
import {
  buildClaudeArgs,
  parseClaudeEnvelope,
  ClaudeCallError,
} from '../../src/ai/claude.js';

const trivialSchema = { type: 'object' } as const;

describe('buildClaudeArgs', () => {
  it('always includes -p + json output format + the schema', () => {
    const args = buildClaudeArgs({ prompt: 'hello', schema: trivialSchema });
    expect(args[0]).toBe('-p');
    const i = args.indexOf('--output-format');
    expect(args[i + 1]).toBe('json');
    const j = args.indexOf('--json-schema');
    expect(JSON.parse(args[j + 1])).toEqual(trivialSchema);
  });

  it('puts the prompt last so it is unambiguously positional', () => {
    const args = buildClaudeArgs({ prompt: 'a long prompt', schema: trivialSchema });
    expect(args[args.length - 1]).toBe('a long prompt');
  });

  it('emits --add-dir in the = form, one flag per dir (prevents variadic prompt-swallowing)', () => {
    const args = buildClaudeArgs({
      prompt: 'p',
      schema: trivialSchema,
      addDirs: ['/repo', '/other'],
    });
    // The previous bug was `args.push('--add-dir', ...dirs)` which writes
    // `--add-dir /repo /other p` — the trailing positional gets swallowed by
    // claude's variadic `--add-dir <directories...>`. The `=` form binds a
    // single value per flag.
    expect(args).toContain('--add-dir=/repo');
    expect(args).toContain('--add-dir=/other');
    // The bare flag (without `=`) must not appear.
    expect(args).not.toContain('--add-dir');
    // The prompt is still last.
    expect(args[args.length - 1]).toBe('p');
  });

  it('omits --add-dir entirely when no dirs are passed', () => {
    const args = buildClaudeArgs({ prompt: 'p', schema: trivialSchema });
    expect(args.some((a) => a.startsWith('--add-dir'))).toBe(false);
  });

  it('passes --bare, --model, and --max-budget-usd when set', () => {
    const args = buildClaudeArgs({
      prompt: 'p',
      schema: trivialSchema,
      bare: true,
      model: 'sonnet',
      maxBudgetUsd: 0.25,
    });
    expect(args).toContain('--bare');
    const mi = args.indexOf('--model');
    expect(args[mi + 1]).toBe('sonnet');
    const bi = args.indexOf('--max-budget-usd');
    expect(args[bi + 1]).toBe('0.25');
  });

  it('omits --bare when bare is false/undefined', () => {
    const a1 = buildClaudeArgs({ prompt: 'p', schema: trivialSchema });
    const a2 = buildClaudeArgs({ prompt: 'p', schema: trivialSchema, bare: false });
    expect(a1).not.toContain('--bare');
    expect(a2).not.toContain('--bare');
  });
});

describe('parseClaudeEnvelope', () => {
  it('reads the schema-conformant payload from structured_output (current claude builds)', () => {
    const stdout = JSON.stringify({
      type: 'result',
      is_error: false,
      result: 'Produced a 5-component architecture: …',
      structured_output: { components: [{ id: 'a', label: 'A' }], edges: [] },
      total_cost_usd: 0.123,
    });
    const { data, costUsd } = parseClaudeEnvelope<{
      components: Array<{ id: string }>;
      edges: unknown[];
    }>(stdout);
    expect(data.components[0].id).toBe('a');
    expect(costUsd).toBe(0.123);
  });

  it('falls back to envelope.result when structured_output is absent (older builds)', () => {
    const stdout = JSON.stringify({
      is_error: false,
      result: { components: [{ id: 'legacy' }], edges: [] },
      total_cost_usd: 0.05,
    });
    const { data } = parseClaudeEnvelope<{ components: Array<{ id: string }> }>(stdout);
    expect(data.components[0].id).toBe('legacy');
  });

  it('parses a JSON-string result field (claude older variants)', () => {
    const stdout = JSON.stringify({
      is_error: false,
      result: JSON.stringify({ components: [{ id: 'stringified' }], edges: [] }),
    });
    const { data } = parseClaudeEnvelope<{ components: Array<{ id: string }> }>(stdout);
    expect(data.components[0].id).toBe('stringified');
  });

  it('extracts the first JSON block from a noisy string result as a last resort', () => {
    const stdout = JSON.stringify({
      is_error: false,
      result: 'Here is the answer: ```json\n{"components":[{"id":"x"}],"edges":[]}\n``` cheers',
    });
    const { data } = parseClaudeEnvelope<{ components: Array<{ id: string }> }>(stdout);
    expect(data.components[0].id).toBe('x');
  });

  it('throws ClaudeCallError with the claude-reported error message when is_error is true', () => {
    const stdout = JSON.stringify({ is_error: true, error: 'Auth required' });
    expect(() => parseClaudeEnvelope(stdout)).toThrow(ClaudeCallError);
    try {
      parseClaudeEnvelope(stdout);
    } catch (err) {
      expect((err as Error).message).toBe('Auth required');
    }
  });

  it('surfaces messages from envelope.errors[] when envelope.error is missing (budget-cap case)', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'error_max_budget_usd',
      is_error: true,
      errors: ['Reached maximum budget ($0.10)'],
    });
    try {
      parseClaudeEnvelope(stdout);
      throw new Error('expected throw');
    } catch (err) {
      expect((err as Error).message).toBe('Reached maximum budget ($0.10)');
    }
  });

  it('falls back to subtype when neither error nor errors[] is present', () => {
    const stdout = JSON.stringify({ is_error: true, subtype: 'rate_limited' });
    try {
      parseClaudeEnvelope(stdout);
      throw new Error('expected throw');
    } catch (err) {
      expect((err as Error).message).toMatch(/rate_limited/);
    }
  });

  it('throws on malformed JSON envelope with a helpful message', () => {
    expect(() => parseClaudeEnvelope('{ not json')).toThrow(/Could not parse Claude JSON envelope/);
  });

  it('throws on an unexpected envelope shape (no usable result field)', () => {
    const stdout = JSON.stringify({ is_error: false, total_cost_usd: 0.01 });
    expect(() => parseClaudeEnvelope(stdout)).toThrow(/unexpected envelope shape/);
  });

  it('attaches stderr + stdout to the thrown ClaudeCallError', () => {
    try {
      parseClaudeEnvelope('not-json', 'boom stderr');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ClaudeCallError);
      const e = err as ClaudeCallError;
      expect(e.stderr).toBe('boom stderr');
      expect(e.stdout).toBe('not-json');
    }
  });
});
