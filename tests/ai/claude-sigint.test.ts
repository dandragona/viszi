import { describe, it, expect } from 'vitest';
import { inflightClaudeCount, terminateInflightClaude } from '../../src/ai/claude.js';

describe('claude SIGINT plumbing', () => {
  it('is idempotent and returns 0 when no claude calls are in-flight', () => {
    expect(inflightClaudeCount()).toBe(0);
    expect(terminateInflightClaude('SIGTERM')).toBe(0);
    expect(terminateInflightClaude('SIGTERM')).toBe(0);
  });
});
