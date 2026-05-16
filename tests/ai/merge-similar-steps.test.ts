import { describe, it, expect } from 'vitest';
import { mergeConsecutiveSimilarSteps } from '../../src/ai/orchestrator.js';

type Step = { componentId: string; action: string; description?: string };

describe('mergeConsecutiveSimilarSteps (#10)', () => {
  it('passes through distinct steps unchanged', () => {
    const steps: Step[] = [
      { componentId: 'a', action: 'validates request schema' },
      { componentId: 'b', action: 'writes audit log' },
      { componentId: 'c', action: 'publishes user.created event' },
    ];
    expect(mergeConsecutiveSimilarSteps(steps)).toHaveLength(3);
  });

  it('keeps consecutive same-component steps when actions are genuinely different', () => {
    const steps: Step[] = [
      { componentId: 'controller', action: 'validates input' },
      { componentId: 'controller', action: 'writes audit log' },
    ];
    expect(mergeConsecutiveSimilarSteps(steps)).toHaveLength(2);
  });

  it('merges identical consecutive steps', () => {
    const steps: Step[] = [
      { componentId: 'a', action: 'processes the request' },
      { componentId: 'a', action: 'processes the request' },
      { componentId: 'b', action: 'returns response' },
    ];
    expect(mergeConsecutiveSimilarSteps(steps)).toHaveLength(2);
  });

  it('merges near-identical consecutive steps (token-set Jaccard ≥ 0.7)', () => {
    const steps: Step[] = [
      { componentId: 'a', action: 'processes the request body' },
      { componentId: 'a', action: 'processes request body data' },
      { componentId: 'b', action: 'returns response' },
    ];
    expect(mergeConsecutiveSimilarSteps(steps)).toHaveLength(2);
  });

  it('merges when one action is a strict token-subset of the other (keeping the longer one)', () => {
    const steps: Step[] = [
      { componentId: 'a', action: 'handles data' },
      { componentId: 'a', action: 'handles data from request' },
    ];
    const merged = mergeConsecutiveSimilarSteps(steps);
    expect(merged).toHaveLength(1);
    expect(merged[0].action).toBe('handles data from request');
  });

  it('does NOT merge across a different componentId boundary', () => {
    const steps: Step[] = [
      { componentId: 'a', action: 'writes log' },
      { componentId: 'b', action: 'writes log' },
    ];
    expect(mergeConsecutiveSimilarSteps(steps)).toHaveLength(2);
  });

  it('concatenates non-empty differing descriptions on merge', () => {
    const steps: Step[] = [
      { componentId: 'a', action: 'validates request', description: 'checks the JSON body' },
      { componentId: 'a', action: 'validates request', description: 'against the OpenAPI schema' },
    ];
    const [merged] = mergeConsecutiveSimilarSteps(steps);
    expect(merged.description).toBe('checks the JSON body; against the OpenAPI schema');
  });

  it('returns empty input as empty', () => {
    expect(mergeConsecutiveSimilarSteps([])).toEqual([]);
  });

  it('returns a single step unchanged', () => {
    const steps: Step[] = [{ componentId: 'a', action: 'x' }];
    expect(mergeConsecutiveSimilarSteps(steps)).toEqual(steps);
  });

  it('handles three-in-a-row near-identical actions on the same component', () => {
    const steps: Step[] = [
      { componentId: 'pipeline', action: 'runs main stages' },
      { componentId: 'pipeline', action: 'runs the main stages' },
      { componentId: 'pipeline', action: 'runs main pipeline stages' },
      { componentId: 'sink', action: 'writes output' },
    ];
    const merged = mergeConsecutiveSimilarSteps(steps);
    expect(merged).toHaveLength(2);
    expect(merged[0].componentId).toBe('pipeline');
    expect(merged[1].componentId).toBe('sink');
  });
});
