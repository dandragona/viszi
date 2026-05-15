# 001 — System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                           viszi CLI                              │
│                                                                  │
│   bin/viszi.js  →  dist/cli/index.js  (Commander)                │
│                          │                                       │
│   ┌──────────────────────┴────────────────────────────────────┐  │
│   │   analyze command                                          │  │
│   │                                                            │  │
│   │   1. traverse(repoRoot)            ───┐                    │  │
│   │   2. parseFile(...) per file          │ Deterministic      │  │
│   │   3. buildDependencyGraph             │ analyzer           │  │
│   │   4. clusterIntoModules            ───┘                    │  │
│   │                                                            │  │
│   │   5. detectEntrypoints                                     │  │
│   │                                                            │  │
│   │   6. orchestrator.runAnalysis ───┐                         │  │
│   │      ├─ buildComponentsPrompt    │                         │  │
│   │      ├─ callClaude({schema})  ◀──┤  spawn `claude -p`      │  │
│   │      ├─ buildFlowsPrompt         │                         │  │
│   │      └─ recurse per child        │                         │  │
│   │                                                            │  │
│   │   7. DiagramWriter.flush  →  .viszi/{index,diagrams,cache} │  │
│   │                                                            │  │
│   │   8. startServer (Fastify)                                 │  │
│   │      ├─ /api/index                                         │  │
│   │      ├─ /api/diagrams/:id                                  │  │
│   │      └─ static SPA  →  open browser                        │  │
│   └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │  HTTP
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Browser (React + React Flow)                    │
│                                                                  │
│   App  →  Topbar (Breadcrumbs)  ┐                                │
│        →  Sidebar (System / Flows / All)                         │
│        →  Routes:                                                │
│             /          → IndexPage  → redirect                   │
│             /d/:id     → DiagramPage → DiagramCanvas             │
│                                       ├─ ELK layout              │
│                                       ├─ ComponentNode           │
│                                       └─ FlowStepNode            │
│        Click a node → navigate(/d/<subDiagramId>)                │
└──────────────────────────────────────────────────────────────────┘
```

## High-level pipeline

| Stage | Where | Purpose |
|---|---|---|
| Discovery | `src/analyzer/traverse.ts` | Walk the repo, honour `.gitignore`, exclude vendor/build dirs, cap file size |
| Language detection | `src/analyzer/languages.ts` | Map extension to a parseable language |
| Parsing | `src/analyzer/parsers/` | Per-language regex extraction of imports, symbols, HTTP handlers |
| Graph build | `src/analyzer/graph.ts` | Files → nodes, resolved imports → edges (graphology) |
| Module clustering | `src/analyzer/modules.ts` | Collapse files into modules (top-level dirs / `src/<sub>` etc) |
| Entrypoint detection | `src/analyzer/entrypoints.ts` | Pull from `package.json`, pyproject, HTTP handlers, naming heuristics |
| AI labelling | `src/ai/orchestrator.ts` | BFS over levels; per scope: prompt → `claude -p --json-schema` → diagram JSON |
| Caching | `src/ai/cache.ts` | Hash inputs; skip Claude on unchanged content |
| Writing | `src/model/writer.ts` | Buffer in memory, flush to `.viszi/diagrams/*.json` + `index.json` |
| Serving | `src/server/index.ts` | Fastify on auto-picked port; serves SPA + JSON endpoints |
| Rendering | `src/web/components/DiagramCanvas.tsx` | React Flow with ELK layout, custom node types |

## Module dependency direction

`cli` → `ai` (orchestrator) → `analyzer` + `model`  
`cli` → `server` → `model`  
`web` (browser) only depends on `model/types.ts` (shared types) and the `/api` endpoints.

The `model/types.ts` file is intentionally framework-free so it can be imported by both Node code and the browser bundle.
