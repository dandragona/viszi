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

## ADR-006: `--bare` mode is opt-in (was: default-on)

**Decision**: `viszi` invokes `claude -p` **without** `--bare` by default. Users opt in with `--bare` when they want hook/MCP/CLAUDE.md-free analysis.

**Context (original)**: We originally defaulted to `--bare` for predictable, repeatable analysis — Claude Code respects user hooks, MCP servers, CLAUDE.md, and skills, and a user with a `Stop` hook or a chatty MCP could derail the run.

**Why we flipped**: `claude --bare` does more than skip hooks. Per the CLI help, it also disables OAuth and keychain reads — auth is strictly via `ANTHROPIC_API_KEY` or `apiKeyHelper`. Since viszi's premise is "you already have Claude Code authenticated", defaulting to `--bare` forced every user without an API key set to either (a) configure one or (b) discover and pass `--no-bare`. That's a poor first-run experience for the modal user, who is OAuth-authenticated.

**Consequences**:
- First-run `viszi <path>` Just Works for OAuth users — no extra auth setup.
- User-installed hooks, MCP servers, and project `CLAUDE.md` files may influence the analysis. In practice the `--json-schema`-constrained prompt is robust to this; in pathological cases the user can pass `--bare` (and an API key) for clean-room behaviour.
- The `--no-bare` flag is gone (default is now off; no need for a way to disable). Existing scripts that passed `--no-bare` will still parse — `--bare` defaults to false, and there is nothing to "un-do".

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

## ADR-010: Adapt to current `claude -p` envelope + variadic flags (2026-05)

**Decision**: When invoking `claude -p`, pass `--add-dir=<path>` (the `=` form, one flag per dir) and parse `structured_output` from the envelope in preference to `result`.

**Context**: While running the SIGINT manual test against a fresh fixture, viszi failed on every Claude invocation under the current `claude` CLI (`2.1.143`). Two unrelated regressions surfaced:

1. `--add-dir` is documented as `<directories...>` (variadic). Writing it as `args.push('--add-dir', ...opts.addDirs)` let claude's argument parser swallow the very next positional — the prompt itself — as another directory. Claude then exited with `Error: Input must be provided either through stdin or as a prompt argument when using --print`.
2. When `--json-schema` is supplied, current builds put the schema-conformant payload in `envelope.structured_output` and a free-text summary in `envelope.result`. Older builds populated `result` directly. viszi's parser expected the JSON in `result`, so every call threw `Claude returned a string result that is not parseable JSON`.

**Why**: Both are stable, minimally invasive adapter changes. The `=` form binds a single value per flag and is robust against future variadic expansions. Preferring `structured_output` and falling back to `result` keeps compatibility with both old and new claude builds.

**Consequences**: viszi can now successfully drive real Claude calls on the current CLI. We pin the assumption "claude CLI envelope shape" to two fields (`structured_output`, `result`); a future envelope change would need a parallel adapter update here. No new dependencies.

---

## ADR-011: Adaptive module clustering depth + member-id fallback (2026-05)

**Decision**: `clusterIntoModules` does a two-pass clustering: first count files per coarse module id, then descend one segment deeper for any module that would exceed `FILES_PER_MODULE_LIMIT` (= 25) files. Additionally, the AI orchestrator's `resolveMemberFiles` accepts a `member` id that doesn't match a module id exactly: it falls back to prefix-matching in either direction (Claude refined further; Claude returned a coarser id).

**Context**: On a real single-package Python codebase (`src/<one-package>/...`), the analyzer's original `moduleIdFor` collapsed all 100+ files under `src/<package>/` into one giant `<package>` module. Claude was then asked to refine that into sub-components and *invented* finer-grained module ids (`<package>/cli`, `<package>/api`, ...) that didn't exist in the analyzer's output. `moduleById.get(...)` returned `undefined`, every L2 component got `files: []`, and every drill-down chain past L2 silently broke.

**Why**: Two independent defenses against the same class of problem.

- The clustering-depth fix gives Claude finer-grained module ids in the first place, so it's less likely to invent ids that miss.
- The fallback resolver tolerates the mismatch when Claude still picks ids the analyzer didn't produce — common for L2+ where Claude is reasoning about sub-systems.

**Consequences**: Module list at L1 may have more nodes than before for big single-package repos (a feature for those repos, neutral for everything else). The fallback resolver adds two prefix scans per member id, which is O(modules × members) — negligible (modules typically ≤ 30, members ≤ 6). Cache keys naturally invalidate because `modulesForPrompt` output changes when the clustering changes. Unit-tested in `tests/ai/resolve-member-files.test.ts` and `tests/analyzer/modules-adaptive.test.ts`.

---

## ADR-007: Single npm package, not a monorepo

**Decision**: One `package.json`. CLI, server, and web frontend all live under `src/`.

**Context**: Considered a pnpm/turbo monorepo splitting `viszi-core` from `viszi-cli` and `viszi-web`.

**Why**: There's no second consumer of `viszi-core` today. The split is overhead.

**Consequences**: If we ever want a JetBrains plugin or an embeddable React component, we'll extract `viszi-core` then.
