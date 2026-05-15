# 003 — Diagram Model

The data model is defined in TypeScript at `src/model/types.ts` and is the contract between the analyzer, the server, and the frontend.

## Top-level types

### `DiagramKind`
`'system' | 'flow'`

### `ComponentKind`
The visual category of a node. Drives icon and accent colour.
`service · controller · database · queue · cache · ui · library · cli · job · config · external · module · unknown`

### `EdgeKind`
`imports · calls · reads · writes · emits · flow`

### `FlowTrigger`
`http · cli · cron · event · init · other`

## `SystemDiagram`

```ts
{
  id: string;             // e.g. "system.root", "system.<hash>"
  kind: 'system';
  level: number;          // 1 = root, increases as you drill in
  parentId?: string;      // SystemDiagram id this drilled out of
  scope: string;          // repo-relative path this diagram covers
  title: string;
  description?: string;
  nodes: DiagramNode[];   // components in this scope
  edges: DiagramEdge[];   // architectural relationships
}
```

## `FlowDiagram`

```ts
{
  id: string;             // e.g. "flow.<hash>"
  kind: 'flow';
  level: number;
  parentId?: string;      // parent FlowDiagram (for sub-flows)
  title: string;
  description?: string;
  trigger: FlowTrigger;
  steps: FlowStep[];      // ordered logical steps
  nodes: DiagramNode[];   // step-as-node form (for React Flow)
  edges: DiagramEdge[];   // step-to-step transitions
}
```

`steps[].componentId` references a node id from a `SystemDiagram` at the same scope. `steps[].subDiagramId` (if present) points to the child `FlowDiagram` that elaborates the step.

## `DiagramNode`

```ts
{
  id: string;
  label: string;
  kind: ComponentKind;
  description?: string;
  files: string[];        // repo-relative paths backing this node
  subDiagramId?: string;  // click target — set when level < maxLevels
  meta?: Record<string, unknown>;
}
```

## `DiagramEdge`

```ts
{
  id: string;
  source: string;         // node id
  target: string;         // node id
  label?: string;
  kind: EdgeKind;
  weight?: number;
}
```

## `DiagramIndex`

The on-disk index file (`<output>/index.json`) the frontend loads first.

```ts
{
  version: string;        // viszi semver at generation time
  generatedAt: string;    // ISO timestamp
  generatedFor: string;   // repo absolute path
  rootSystemId: string;
  flows: { id: string; title: string; trigger: FlowTrigger }[];
  diagrams: DiagramIndexEntry[];
  meta: {
    levels: number;
    flowsEnabled: boolean;
    aiCallCount: number;
    estimatedCostUsd?: number;
  };
}
```

## On-disk layout

```
<output>/
├── index.json
├── meta.json
├── diagrams/
│   ├── system.root.json
│   ├── system.root.<comp-id>.json
│   ├── system.<scope-hash>.json
│   ├── flow.<hash>.json
│   └── ...
└── cache/
    └── <prompt>__<scope>__L<n>__<schema>__<contentHash>.json
```

Filenames are sanitized via `sanitizeId()` — only `[A-Za-z0-9._-]`.
