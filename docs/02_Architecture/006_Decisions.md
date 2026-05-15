# 006 — Decisions (ADR-style log)

Each entry follows: **Decision · Context · Why · Consequences**.

## ADR-001: TypeScript / Node, distributed via npm

**Decision**: Build viszi in TS targeting Node ≥ 20, ship as a single npm package, run via `npx viszi`.

**Context**: We needed an "easy install" path. Claude Code is itself a Node CLI, so users already have a Node runtime.

**Why**: `npx` is zero-install. The React/React Flow ecosystem is JS-native, so the frontend is essentially free. A single `package.json` keeps the release process simple.

**Consequences**: We pay a Node startup cost (~200 ms). We can't ship as a single static binary; users need npm.

---

## ADR-002: Hybrid AI strategy (deterministic scan + targeted Claude calls)

**Decision**: viszi parses the codebase, builds a graph, and clusters into modules deterministically. Claude is only asked to **label, group, and describe** the structure, not to discover it.

**Context**: We considered (a) letting Claude explore the codebase freely with its built-in tools, and (b) packing whole files into one giant call. Both are slower / more expensive / less reliable than the hybrid approach for the level of structure viszi needs.

**Why**: Determinism keeps repeat runs identical. Pre-summarising lets us cache aggressively. AI excels at naming and grouping where it would be slow to explore.

**Consequences**: viszi is bounded in what it can express; if our heuristics miss a kind of file, it can't be in the diagram. We accept this tradeoff for v0.1.

---

## ADR-003: Regex parsers in v0.1, tree-sitter behind the same interface for v0.2

**Decision**: Implement `LanguageParser` with regex-based extraction for TS/JS, Python, Go.

**Context**: `web-tree-sitter` (WASM) requires shipping per-language `.wasm` grammar files in the npm tarball — adds bundle size and a build step. Native tree-sitter requires `node-gyp`, which breaks `npx` on Windows/musl.

**Why**: Regex is sufficient for the inputs the AI prompts need (imports, top-level symbols, HTTP handlers). Shipping no WASM binaries simplifies installation.

**Consequences**: Some edge cases (decorators-as-imports, complex destructuring, conditional imports) won't be picked up. Acceptable for v0.1; future work tracked in `003_AI_Orchestration.md`.

---

## ADR-004: React Flow + ELK.js for rendering

**Decision**: Use React Flow for the canvas, ELK for layered layout.

**Context**: Considered Mermaid, Cytoscape, and a hand-rolled D3 layout.

**Why**: React Flow gives interactive nodes (hover, click, drag, zoom, mini-map) for free with a polished default look. ELK's layered algorithm produces clean architecture-style layouts; dagre is a fallback if needed.

**Consequences**: Bigger client bundle than Mermaid. We accept this — viszi is run locally; bundle size matters less than UX.

---

## ADR-005: Local Fastify server + auto-open browser

**Decision**: Don't ship a static HTML output by default; instead spin up a tiny local server.

**Context**: A static directory is easy to share but loads JSON files via `fetch`, which `file://` browsers block by default in many configurations.

**Why**: `--no-serve` still writes the JSON files for users who want to host them elsewhere. The default just-works experience is more important than the share-ability of a single file.

**Consequences**: First run requires Node to keep running. Acceptable.

---

## ADR-006: `--bare` mode by default for `claude` invocations

**Decision**: When viszi calls `claude -p`, we pass `--bare` by default. Users can opt out with `--no-bare`.

**Context**: Claude Code respects user hooks, MCP servers, CLAUDE.md, and skills. A user with project-specific skills could get smarter analysis — or could have a `Stop` hook that hangs viszi.

**Why**: Predictable, repeatable analysis is more important by default than personalisation. Power users can flip it.

**Consequences**: We don't benefit from a user's tuning unless they ask for it. We avoid hard-to-debug failures from foreign hook configurations.

---

## ADR-008: Server-first analyze flow + WebSocket progress

**Decision**: When `viszi <path>` runs with `--serve` (the default), boot the Fastify server *before* starting analysis and stream progress to the browser over a WebSocket.

**Context**: v0.1 ran the full analysis, then started the server, then opened the browser. Long runs felt unresponsive — users stared at a terminal spinner.

**Why**: Server-first lets the browser open immediately and show what's happening live. The cost is small: a `EventBus` (`src/server/eventBus.ts`) bridges the orchestrator to WebSocket subscribers; the analyzer publishes progress events; the frontend `ProgressBanner` subscribes and the App refetches `/api/index` once the bus signals `done`.

**Consequences**: The analyzer is no longer purely synchronous from the user's POV — the server has to keep accepting requests while it runs. We bound everything to localhost (already true) and reset state on each new analyze run, so concurrency is safe.

---

## ADR-009: Static HTML export via `window.__VISZI_DATA__`

**Decision**: `viszi export` emits one self-contained `.html` containing the bundled JS, CSS, and every diagram as JSON in `window.__VISZI_DATA__`. The frontend prefers that data when present and falls back to `/api/*` otherwise.

**Context**: Considered (a) requiring users to host the `.viszi/` directory themselves, or (b) shipping a separate "viewer" build. (a) breaks the "just send a link/file" UX; (b) adds a maintenance surface.

**Why**: The same React app handles both modes via a single `STATIC_MODE` flag. No code is duplicated. The output file is the entire viewer + the entire dataset, sharable in chat/email.

**Consequences**: File sizes are bundle + data, ~1.7 MB today (mostly the React Flow + ELK bundle). Acceptable. Live progress is disabled in static mode (the bus would have nothing to publish).

---

## ADR-007: Single npm package, not a monorepo

**Decision**: One `package.json`. CLI, server, and web frontend all live under `src/`.

**Context**: Considered a pnpm/turbo monorepo splitting `viszi-core` from `viszi-cli` and `viszi-web`.

**Why**: There's no second consumer of `viszi-core` today. The split is overhead.

**Consequences**: If we ever want a JetBrains plugin or an embeddable React component, we'll extract `viszi-core` then.
