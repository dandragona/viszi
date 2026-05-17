import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import {
  ComponentsSchema,
  FlowsSchema,
  SubFlowSchema,
  SCHEMA_VERSION,
} from '../../src/ai/schemas.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateComponents = ajv.compile(ComponentsSchema);
const validateFlows = ajv.compile(FlowsSchema);
const validateSubFlow = ajv.compile(SubFlowSchema);

describe('schemas', () => {
  it('SCHEMA_VERSION is a non-empty string (cache invalidation hinge)', () => {
    expect(typeof SCHEMA_VERSION).toBe('string');
    expect(SCHEMA_VERSION).not.toHaveLength(0);
  });

  it('ComponentsSchema accepts a realistic Claude response', () => {
    const sample = {
      components: [
        {
          id: 'api',
          label: 'HTTP API',
          kind: 'controller',
          description: 'Routes incoming HTTP requests to handlers.',
          members: ['mod_api'],
        },
        {
          id: 'db',
          label: 'Database',
          kind: 'database',
          description: 'Persists user records.',
          members: ['mod_db'],
        },
      ],
      edges: [{ source: 'api', target: 'db', kind: 'reads', label: 'select' }],
    };
    const ok = validateComponents(sample);
    if (!ok) console.error(validateComponents.errors);
    expect(ok).toBe(true);
  });

  it('ComponentsSchema rejects unknown kinds and missing fields', () => {
    expect(
      validateComponents({
        components: [{ id: 'x', label: 'X', kind: 'planet', description: 'd', members: ['m'] }],
        edges: [],
      }),
    ).toBe(false);

    expect(
      validateComponents({
        components: [{ id: 'x', label: 'X', kind: 'service', members: ['m'] }],
        edges: [],
      }),
    ).toBe(false);
  });

  it('FlowsSchema accepts a realistic Claude response', () => {
    const sample = {
      flows: [
        {
          id: 'login',
          name: 'User login',
          description: 'Authenticate a user with email + password.',
          trigger: 'http',
          steps: [
            {
              order: 1,
              componentId: 'api',
              action: 'POST /login',
              description: 'Entry point — validates credentials before any DB read.',
              files: ['src/api/login.ts'],
            },
            {
              order: 2,
              componentId: 'db',
              action: 'SELECT user',
              description: 'Lookup the user row to compare password hash.',
            },
          ],
        },
      ],
    };
    const ok = validateFlows(sample);
    if (!ok) console.error(validateFlows.errors);
    expect(ok).toBe(true);
  });

  it('FlowsSchema requires steps.length >= 2', () => {
    const bad = {
      flows: [
        {
          id: 'single',
          name: 'Single step',
          description: 'Too short.',
          trigger: 'cli',
          steps: [
            {
              order: 1,
              componentId: 'api',
              action: 'only one',
              description: 'But the schema still requires at least 2.',
            },
          ],
        },
      ],
    };
    expect(validateFlows(bad)).toBe(false);
  });

  it('FlowsSchema caps step.files at 5', () => {
    const tooManyFiles = {
      flows: [
        {
          id: 'over',
          name: 'Cited too many files',
          description: 'Six is one too many.',
          trigger: 'cli',
          steps: [
            {
              order: 1,
              componentId: 'a',
              action: 'do thing',
              description: 'Step 1.',
              files: ['1.ts', '2.ts', '3.ts', '4.ts', '5.ts', '6.ts'],
            },
            {
              order: 2,
              componentId: 'a',
              action: 'do another thing',
              description: 'Step 2.',
            },
          ],
        },
      ],
    };
    expect(validateFlows(tooManyFiles)).toBe(false);
  });

  it('FlowsSchema rejects steps missing required description', () => {
    const noDescription = {
      flows: [
        {
          id: 'undescribed',
          name: 'No description',
          description: 'Top-level desc exists; step desc does not.',
          trigger: 'cli',
          steps: [
            { order: 1, componentId: 'a', action: 'a thing' },
            { order: 2, componentId: 'b', action: 'another thing' },
          ],
        },
      ],
    };
    expect(validateFlows(noDescription)).toBe(false);
  });

  it('SubFlowSchema mirrors FlowsSchema.steps', () => {
    expect(
      validateSubFlow({
        steps: [
          {
            order: 1,
            componentId: 'a',
            action: 'do A',
            description: 'Component A does its half.',
            files: ['src/a.ts'],
          },
          {
            order: 2,
            componentId: 'b',
            action: 'do B',
            description: 'Then B does the other half.',
          },
        ],
      }),
    ).toBe(true);
  });
});
