import { describe, it, expect } from 'vitest';
import {
  buildComponentsExplanationPrompt,
  buildComponentsPrompt,
} from '../../src/ai/prompts/components.js';
import {
  buildFlowsExplanationPrompt,
  buildFlowsPrompt,
} from '../../src/ai/prompts/flows.js';

const baseComponents = {
  scope: 'src/api',
  level: 2,
  totalLevels: 2,
  parentLabel: 'API',
  parentDescription: 'Public API surface',
  modules: [
    { id: 'auth', files: ['src/api/auth.ts'], importsModules: [], callsModules: [] },
    { id: 'users', files: ['src/api/users.ts'], importsModules: ['auth'], callsModules: ['auth'] },
  ] as unknown as Parameters<typeof buildComponentsPrompt>[0]['modules'],
  graphSummary: { files: 12, loc: 3400, edges: 18 },
};

const baseFlows = {
  scope: '',
  level: 1,
  totalLevels: 2,
  componentSummary: [
    { id: 'api', label: 'API', kind: 'service', description: 'HTTP surface' },
    { id: 'db', label: 'DB', kind: 'database', description: 'Postgres' },
  ],
  entrypoints: [{ kind: 'http', label: 'POST /signup', file: 'src/api/users.ts' }] as unknown as Parameters<typeof buildFlowsPrompt>[0]['entrypoints'],
  graphSummary: { files: 12, loc: 3400, edges: 18 },
};

describe('components two-stage prompts', () => {
  it('stage-1 (explanation) tells the model not to output JSON', () => {
    const p = buildComponentsExplanationPrompt(baseComponents);
    expect(p).toMatch(/Do not produce a diagram yet/i);
    expect(p).toMatch(/Do not output JSON/i);
    // The narrative is supposed to be the *only* context for stage 2 — make
    // sure the prompt actually says so, since prompt regressions here would
    // silently degrade output quality.
    expect(p).toMatch(/only context for the next call/i);
  });

  it('stage-1 still injects the module list (model needs the raw evidence)', () => {
    const p = buildComponentsExplanationPrompt(baseComponents);
    expect(p).toContain('"id": "auth"');
    expect(p).toContain('"id": "users"');
  });

  it('stage-2 with no explanation matches the legacy single-stage shape', () => {
    const p = buildComponentsPrompt(baseComponents);
    expect(p).not.toContain('<prior_explanation>');
    expect(p).toContain('Group these modules');
  });

  it('stage-2 injects the prior explanation when supplied', () => {
    const explanation = 'The API splits into two pieces: Auth (token issuance) and Users (CRUD).';
    const p = buildComponentsPrompt({ ...baseComponents, explanation });
    expect(p).toContain('<prior_explanation>');
    expect(p).toContain(explanation);
    expect(p).toContain('</prior_explanation>');
    // The injection tells the model the narrative is ground truth — that's
    // the entire point of two-stage, not just "more context".
    expect(p).toMatch(/prefer the narrative/i);
  });

  it('stage-2 trims whitespace from the injected explanation', () => {
    const p = buildComponentsPrompt({
      ...baseComponents,
      explanation: '\n\n   The system is mostly an Auth + Users split.   \n\n',
    });
    expect(p).toContain('<prior_explanation>\nThe system is mostly an Auth + Users split.\n</prior_explanation>');
  });
});

describe('flows two-stage prompts', () => {
  it('stage-1 (explanation) names flows in prose, not JSON', () => {
    const p = buildFlowsExplanationPrompt(baseFlows);
    expect(p).toMatch(/Do not produce a diagram yet/i);
    expect(p).toMatch(/Do not output JSON/i);
    // Stage-1 for flows asks for the *flow names + component sequences*,
    // not the step-level detail (that's stage 2's job).
    expect(p).toMatch(/rough sequence of components/i);
  });

  it('stage-1 reformats guidance for sub-flow (level > 1) tier', () => {
    const subFlow = {
      ...baseFlows,
      level: 2,
      parentFlowName: 'User signup',
      parentStepAction: 'validates input',
    };
    const p = buildFlowsExplanationPrompt(subFlow);
    expect(p).toMatch(/sub-flow drilling/i);
    expect(p).toMatch(/1-4 meaningful sub-sequences/i);
    // Top-level guidance is omitted at depth.
    expect(p).not.toMatch(/3-8 most important user-visible/i);
  });

  it('stage-2 injects the prior flows narrative', () => {
    const explanation = '1. User signup — touches API then DB. 2. Login — same.';
    const p = buildFlowsPrompt({ ...baseFlows, explanation });
    expect(p).toContain('<prior_explanation>');
    expect(p).toContain(explanation);
    expect(p).toMatch(/ground truth/i);
  });

  it('stage-2 without explanation matches the legacy shape', () => {
    const p = buildFlowsPrompt(baseFlows);
    expect(p).not.toContain('<prior_explanation>');
    expect(p).toMatch(/important user-visible or system-critical flows/i);
  });
});
