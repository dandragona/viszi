# 004 — Frontend Architecture

## Stack

- **React 18** with the new `createRoot` API.
- **react-router-dom v6** in `HashRouter` mode (no server-side routing needed; we serve a single SPA from Fastify).
- **React Flow v11** for diagram rendering.
- **ELK.js** (`elkjs/lib/elk.bundled.js`) for layered layout.
- **lucide-react** for icons.
- **Vite** as the build tool. No CSS framework — small bespoke `styles.css` keeps the bundle tight.

## Routes

| Path | Component | Behaviour |
|---|---|---|
| `/` | `IndexPage` | Fetches `/api/index`, redirects to `/d/<rootSystemId>` |
| `/d/:id` | `DiagramPage` | Fetches `/api/diagrams/:id`, renders `DiagramCanvas` |
| `*` | `NotFoundPage` | Friendly 404 |

Hash routing means deep links survive a page refresh against the static SPA fallback.

## Component tree

```
App
├── Topbar
│   ├── Brand (link home)
│   └── Breadcrumbs (walks parentId chain via DiagramIndex)
├── Sidebar
│   ├── System (root system diagram)
│   ├── Flows (level-1 flows)
│   └── All Diagrams (sorted by level)
└── Routes
    ├── IndexPage           → redirect
    ├── DiagramPage
    │   └── DiagramCanvas
    │       ├── DiagramMeta (title / subtitle / description card)
    │       └── ReactFlow
    │           ├── ComponentNode  (system diagram nodes)
    │           ├── FlowStepNode   (flow diagram nodes)
    │           ├── MiniMap
    │           └── Controls
    └── NotFoundPage
```

## Custom node types

Two custom node components are registered via React Flow's `nodeTypes` map:

- **`ComponentNode`** — used in system diagrams. Shows icon + label + kind badge + description + file count. If `subDiagramId` is set, the node is hoverable and clickable (`onDrill(id)` → `navigate(/d/<id>)`).
- **`FlowStepNode`** — used in flow diagrams. Shows step ordinal in a circle, the action verb as the label, the underlying component badge, and an optional sub-flow drill.

Both pull their accent colour, background, border, glow, and icon from `theme.ts → styleForKind(kind)`.

## Layout

`layout/elk.ts` wraps `elkjs` with the `layered` algorithm:
- System diagrams use `LEFT → RIGHT` flow.
- Flow diagrams use `TOP → DOWN` flow.

Layout runs once per diagram on load; nodes can then be dragged.

## Theme

Defined in `styles.css` via CSS variables. Dark mode by default; the palette uses muted neutrals with vivid accent hues per kind. Inter is the primary UI font with a system-mono fallback for ordinals/code.

## API surface (consumed)

- `GET /api/index` → `DiagramIndex`
- `GET /api/diagrams/:id` → `SystemDiagram | FlowDiagram`
- `GET /api/meta` → on-disk meta (used in the future for "regenerate" affordance)
