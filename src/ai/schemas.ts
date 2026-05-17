// JSON Schemas passed via `claude -p --json-schema` to constrain structured output.
// Keep these in sync with `parseClaudeComponents` / `parseClaudeFlows` in orchestrator.ts.

export const ComponentsSchema = {
  type: 'object',
  required: ['components', 'edges'],
  additionalProperties: false,
  properties: {
    components: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: {
        type: 'object',
        required: ['id', 'label', 'kind', 'description', 'members'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: '^[a-z][a-z0-9_-]{0,40}$' },
          label: { type: 'string', minLength: 1, maxLength: 60 },
          kind: {
            type: 'string',
            enum: [
              'service',
              'controller',
              'database',
              'queue',
              'cache',
              'ui',
              'library',
              'cli',
              'job',
              'config',
              'external',
              'module',
              'unknown',
            ],
          },
          description: { type: 'string', minLength: 1, maxLength: 280 },
          members: {
            type: 'array',
            minItems: 1,
            items: { type: 'string' },
          },
        },
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        required: ['source', 'target', 'kind'],
        additionalProperties: false,
        properties: {
          source: { type: 'string' },
          target: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['imports', 'calls', 'reads', 'writes', 'emits'],
          },
          label: { type: 'string', maxLength: 60 },
        },
      },
    },
  },
} as const;

export const FlowsSchema = {
  type: 'object',
  required: ['flows'],
  additionalProperties: false,
  properties: {
    flows: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        required: ['id', 'name', 'description', 'trigger', 'steps'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: '^[a-z][a-z0-9_-]{0,40}$' },
          name: { type: 'string', minLength: 1, maxLength: 60 },
          description: { type: 'string', minLength: 1, maxLength: 280 },
          trigger: {
            type: 'string',
            enum: ['http', 'cli', 'cron', 'event', 'init', 'other'],
          },
          steps: {
            type: 'array',
            minItems: 2,
            maxItems: 12,
            items: {
              type: 'object',
              required: ['order', 'componentId', 'action', 'description'],
              additionalProperties: false,
              properties: {
                order: { type: 'integer', minimum: 1 },
                componentId: { type: 'string' },
                action: { type: 'string', minLength: 1, maxLength: 80 },
                description: { type: 'string', minLength: 1, maxLength: 280 },
                files: {
                  type: 'array',
                  maxItems: 5,
                  items: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export const SubFlowSchema = {
  type: 'object',
  required: ['steps'],
  additionalProperties: false,
  properties: {
    steps: {
      type: 'array',
      minItems: 2,
      maxItems: 20,
      items: {
        type: 'object',
        required: ['order', 'componentId', 'action', 'description'],
        additionalProperties: false,
        properties: {
          order: { type: 'integer', minimum: 1 },
          componentId: { type: 'string' },
          action: { type: 'string', minLength: 1, maxLength: 80 },
          description: { type: 'string', minLength: 1, maxLength: 280 },
          files: {
            type: 'array',
            maxItems: 5,
            items: { type: 'string' },
          },
        },
      },
    },
  },
} as const;

export const SCHEMA_VERSION = '4';
