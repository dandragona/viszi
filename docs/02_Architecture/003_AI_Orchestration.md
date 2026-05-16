# 003 — AI Orchestration

## Inference target

viszi never imports the Anthropic SDK. It shells out to the user's `claude` CLI:

```bash
claude -p \
  --output-format json \
  --json-schema '<schema>' \
  --max-budget-usd <amount> \
  [--bare] [--model <alias>] [--add-dir <repo>] \
  '<prompt>'
```

`--json-schema` constrains Claude's response to a strict structure; `--output-format json` wraps the whole call in an envelope (`{ result, total_cost_usd, is_error, ... }`). The wrapper code lives in `src/ai/claude.ts`.

If `claude` isn't on PATH, `ClaudeUnavailableError` is thrown with installation guidance.

## Schemas

Defined in `src/ai/schemas.ts`. Two primary schemas:

- **`ComponentsSchema`** — components + edges for a system diagram.
- **`FlowsSchema`** — flows with ordered steps that reference component ids.

A `SCHEMA_VERSION` constant participates in the cache key — bump it whenever the prompt or schema changes, so previous cached responses are invalidated.

## Prompts

Located in `src/ai/prompts/`. Prompts are pure functions of typed inputs:
- `buildComponentsPrompt({ scope, level, totalLevels, parentLabel?, parentDescription?, modules, graphSummary })` — for system diagrams.
- `buildFlowsPrompt({ scope, componentSummary, entrypoints, parentFlowName?, parentStepAction?, level, totalLevels })` — for flow diagrams (and sub-flows).

Prompts include the deterministic module/component summary as JSON inside the prompt text; Claude is told to ground its labelling in those structures rather than invent ids.

## Recursion (BFS)

`runAnalysis()` is a single entry point that does three things in order:
1. Walk + parse the whole repo once.
2. Recurse `analyzeSystemTier` for the system diagram tree.
3. (Optional) Recurse `analyzeFlowsTier` for the flow diagram tree.

`analyzeSystemTier` builds a level-N system diagram for a given scope, then for each component with `level < opts.levels` enqueues a child tier covering only that component's files. Sibling components at the same level are processed in parallel batches of `--concurrency`.

`analyzeFlowsTier` builds the level-1 flow diagram set, then drills into the first 3 steps of each flow as sub-flows. The "first 3" cap is a deliberate cost-control — drilling into every step would explode AI usage at higher levels.

## Caching (`cache.ts`)

Cache key = SHA-256 of `(promptName, scope, level, schemaVersion, contentHash(promptInput))`, truncated to 24 hex chars. Stored as JSON files in `.viszi/cache/`.

Re-running viszi on an unchanged repo is therefore **zero AI calls**.

`--no-cache` disables both reads and writes.

## Dry-run mode

`--dry-run` skips Claude entirely. The orchestrator emits **synthetic stub responses**:
- One component per detected module, kind guessed from name (`db` → database, `cache` → cache, etc.).
- Components linked in a chain.
- A single mock flow walking the first five components.

Useful for offline iteration on the frontend, for previewing output structure before paying for AI calls, and for testing.

## Cost control levers

| Lever | Where | Effect |
|---|---|---|
| `--max-budget-usd` | per-call | Caps per-call USD; passed to `claude --max-budget-usd` |
| `--concurrency` | scheduling | Controls parallelism; doesn't reduce total cost but smooths runtime |
| Caching | automatic | Re-runs are free if inputs haven't changed |
| Pre-summarising | always on | We send module summaries, not raw source |
| `--bare` | per-call | Skips the user's hooks/MCP/CLAUDE.md to keep behaviour predictable |
| `--levels` | per-run | The dominant lever; level=1 is one call per scope, level=3 fans out fast |

## Interruption (SIGINT)

`src/ai/claude.ts` tracks every in-flight `claude` subprocess in a module-level `Set`. The CLI installs a `SIGINT` (and `SIGTERM`) handler in `src/cli/commands/analyze.ts` that:

1. Calls `terminateInflightClaude('SIGTERM')` to propagate termination to every running `claude` child.
2. Publishes an `error: 'Interrupted by user (SIGINT).'` event on the bus so any connected WebSocket clients see the abort.
3. `await server?.close()` flushes Fastify cleanly.
4. Exits with code `130` (POSIX convention for SIGINT).

A second Ctrl-C inside the cleanup window bypasses the await and exits immediately.

Cache entries are persisted by `AiCache.set()` after each individual call completes, so an interrupted run resumes from where it stopped — no partial-state mop-up is needed.

`execa` is invoked with `cleanup: true` (its default, made explicit) so the OS cleans up any child that survives the SIGTERM if the parent then dies.

## Open issues / future work

- A `--total-budget-usd` global cap that aborts the run.
- A planner pass that estimates total spend before any Claude call (helps users tune `--levels`).
- Tree-sitter parsing for higher-fidelity inputs.
