import { describe, it, expect } from 'vitest';
import { estimateAiCalls, COST_PER_CALL_PRIOR_USD } from '../../src/ai/orchestrator.js';

describe('estimateAiCalls (#14)', () => {
  it('returns 1 for a single-level run with no flows', () => {
    expect(estimateAiCalls(3, 1, false)).toBe(1);
  });

  it('grows with branching factor at higher levels', () => {
    const lvl1 = estimateAiCalls(8, 1, false);
    const lvl2 = estimateAiCalls(8, 2, false);
    const lvl3 = estimateAiCalls(8, 3, false);
    expect(lvl1).toBe(1);
    expect(lvl2).toBe(1 + 8);
    expect(lvl3).toBe(1 + 8 + 64);
  });

  it('caps branching at 8 (matches schema maxItems for components)', () => {
    expect(estimateAiCalls(100, 2, false)).toBe(estimateAiCalls(8, 2, false));
  });

  it('includes flow calls when flowsEnabled', () => {
    const noFlows = estimateAiCalls(4, 2, false);
    const withFlows = estimateAiCalls(4, 2, true);
    expect(withFlows).toBeGreaterThan(noFlows);
  });

  it('cost prior is sane', () => {
    expect(COST_PER_CALL_PRIOR_USD).toBeGreaterThan(0);
    expect(COST_PER_CALL_PRIOR_USD).toBeLessThan(5);
  });
});
