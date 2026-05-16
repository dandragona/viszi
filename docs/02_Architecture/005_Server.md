# 005 — Server

## Why Fastify

- Fast cold start (matters for `npx`).
- Minimal middleware ceremony for the small surface area we need.
- Built-in `@fastify/static` for the SPA bundle.

## Boot sequence (`src/server/index.ts`)

1. Pick a free port via `get-port` (preferring 4321 → 4322 → 4323 → 5173 → 5174).
2. Bind to `127.0.0.1` only (never `0.0.0.0`) — diagrams are local-only by design.
3. Register `@fastify/static` with `webDistDir()` as root if it exists.
4. Register API routes (`/api/index`, `/api/meta`, `/api/diagrams/:id`).
5. Install a `notFoundHandler` that:
   - Returns JSON 404 for `/api/*`.
   - Falls through to `index.html` for any other path (SPA routing fallback).
   - Returns a hand-rolled HTML message if the SPA hasn't been built.
6. Listen on the chosen port.
7. Open the browser via `open` (unless `--no-open`).

## Endpoints

| Path | Returns |
|---|---|
| `GET /api/index` | The full `DiagramIndex`. |
| `GET /api/meta` | The on-disk `meta.json`. |
| `GET /api/diagrams/:id` | A single diagram (system or flow). |
| `GET /*` | The SPA. |

`:id` is sanitised with `sanitizeId()` (only `[A-Za-z0-9._-]`) before being used as a filename — protects against directory traversal.

## Security posture

- Bound to loopback.
- No CORS headers (everything is same-origin).
- No mutating endpoints — read-only.
- No auth (it's local).

## Resource lifetime

The server stays alive until the user hits Ctrl-C; the analyze command's promise blocks indefinitely after a successful start. A future `--watch` mode will re-run the analyzer in-process on file changes.

## Live progress (`src/server/eventBus.ts`)

The analyze command publishes `ProgressEvent`s onto a singleton `EventBus`. The bus maintains a current `BusState` and broadcasts both `progress` deltas and `state` snapshots over the `/ws/progress` WebSocket so newly-connected clients can be brought up to date.

`BusState` fields (rough order of usefulness to the UI):

| Field | Source | Notes |
|---|---|---|
| `state` | `start()` / `done()` / `error()` | `idle` / `running` / `done` / `error`. |
| `diagrams` | `diagramAdded` events | List of `{id, kind, level, title, parentId}`. |
| `aiCallCount` | `ai` progress events | Calls completed so far (cache hits + fresh). |
| `aiCallTotal` | `plan` event + refined after L1 | Upper bound estimate. Powers the `[done/total]` bar. |
| `costSoFar` | `ai.cumulativeCostUsd` | Sum of `total_cost_usd` from claude responses. |
| `estimatedCostUsd` | `plan` event | Upper bound: `aiCallTotal × COST_PER_CALL_PRIOR_USD`. |
| `cacheHits` / `cacheMisses` | `ai` events | Split of cached vs fresh calls. |
| `lastProgress` | most recent event | Lets clients pick up mid-run. |

The bus is purely a fan-out — it never reads back from the WebSocket. Subscribers attach via `bus.subscribe(handler)`.
