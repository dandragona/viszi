import { describe, it, expect } from 'vitest';
import { computeMonoComponent, MONO_COMPONENT_THRESHOLD_DEFAULT } from '../../src/ai/orchestrator.js';
import type { DiagramNode, FlowStep } from '../../src/model/types.js';

function step(id: string, componentId: string, order = 0): FlowStep {
  return { id, order, componentId, action: `do-${id}` };
}

function comp(id: string, label: string): DiagramNode {
  return { id, label, kind: 'service', files: [] };
}

describe('computeMonoComponent (#13)', () => {
  const components = [comp('app', 'App Service'), comp('db', 'DB'), comp('ui', 'UI')];

  it('flags a flow when 7 of 8 steps share one componentId (≥ 0.8 default)', () => {
    const steps: FlowStep[] = [
      step('s1', 'app'),
      step('s2', 'app'),
      step('s3', 'app'),
      step('s4', 'app'),
      step('s5', 'app'),
      step('s6', 'app'),
      step('s7', 'app'),
      step('s8', 'db'),
    ];
    const mono = computeMonoComponent(steps, components);
    expect(mono).toBeDefined();
    expect(mono?.componentId).toBe('app');
    expect(mono?.componentLabel).toBe('App Service');
    expect(mono?.share).toBeCloseTo(7 / 8, 5);
  });

  it('does not flag a balanced flow (3/3/2 across three components)', () => {
    const steps: FlowStep[] = [
      step('s1', 'app'),
      step('s2', 'app'),
      step('s3', 'app'),
      step('s4', 'db'),
      step('s5', 'db'),
      step('s6', 'db'),
      step('s7', 'ui'),
      step('s8', 'ui'),
    ];
    expect(computeMonoComponent(steps, components)).toBeUndefined();
  });

  it('respects a custom threshold override', () => {
    const steps: FlowStep[] = [
      step('s1', 'app'),
      step('s2', 'app'),
      step('s3', 'app'),
      step('s4', 'db'),
    ];
    // 3/4 = 0.75 — below default but above 0.6.
    expect(computeMonoComponent(steps, components)).toBeUndefined();
    expect(computeMonoComponent(steps, components, 0.6)?.share).toBeCloseTo(0.75, 5);
  });

  it('returns undefined when steps is empty', () => {
    expect(computeMonoComponent([], components)).toBeUndefined();
  });

  it('uses the componentId as label if the component is missing from the index', () => {
    const steps: FlowStep[] = [
      step('s1', 'orphan'),
      step('s2', 'orphan'),
      step('s3', 'orphan'),
      step('s4', 'orphan'),
    ];
    expect(computeMonoComponent(steps, components)?.componentLabel).toBe('orphan');
  });

  it('disables itself when threshold > 1', () => {
    const steps: FlowStep[] = [step('s1', 'app'), step('s2', 'app')];
    expect(computeMonoComponent(steps, components, 1.5)).toBeUndefined();
  });

  it('default threshold is 0.8', () => {
    expect(MONO_COMPONENT_THRESHOLD_DEFAULT).toBe(0.8);
  });

  it('flags a flow at exactly the threshold (4/5 = 0.8 default)', () => {
    const steps: FlowStep[] = [
      step('s1', 'app'),
      step('s2', 'app'),
      step('s3', 'app'),
      step('s4', 'app'),
      step('s5', 'db'),
    ];
    expect(computeMonoComponent(steps, components)?.share).toBeCloseTo(0.8, 5);
  });
});
