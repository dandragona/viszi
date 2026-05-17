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

## ADR-012: Cross-tier parallelism between system and flow analysis (2026-05)

**Decision**: `analyzeSystemTier` exposes an `onSystemAdded(diagram)` callback fired immediately after each system diagram is written. `runAnalysis` uses it on the L1 root system to kick off `analyzeFlowsTier` as an unawaited promise; the two then run concurrently and are joined once at the end.

**Context**: Previously `runAnalysis` did `await analyzeSystemTier(...)` (which itself synchronously recursed L2 → L3 → …) and *then* checked `flowsEnabled`. On a 3-L2 / 7-L1-flow shape at `concurrency=4` that meant two large serialised batches — even though the L1 flow tier depends only on the L1 root, not on any L2 result.

**Why**: The dependency graph is the source of truth: L1 flows need the L1 root nodes list, nothing more. Adding a single-arg hook is the smallest change that lets the caller act on that ready signal without restructuring the recursion. The default-concurrency tweak (`min(8, max(4, cpus))`) complements this — both tiers can sustain higher in-flight counts during the overlap window.

**Consequences**: Wall-time drops noticeably on repos with both an L2 system fanout *and* multiple L1 flows. Peak in-flight Claude calls can briefly hit `2 × --concurrency` during overlap; users running close to Anthropic rate limits should lower the flag explicitly. The hook is otherwise inert (only the L1 callback path uses it), so non-flows runs are unaffected.

---

## ADR-011: Adaptive module clustering depth + member-id fallback (2026-05)

**Decision**: `clusterIntoModules` does a two-pass clustering: first count files per coarse module id, then descend one segment deeper for any module that would exceed `FILES_PER_MODULE_LIMIT` (= 25) files. Additionally, the AI orchestrator's `resolveMemberFiles` accepts a `member` id that doesn't match a module id exactly: it falls back to prefix-matching in either direction (Claude refined further; Claude returned a coarser id).

**Context**: On a real single-package Python codebase (`src/<one-package>/...`), the analyzer's original `moduleIdFor` collapsed all 100+ files under `src/<package>/` into one giant `<package>` module. Claude was then asked to refine that into sub-components and *invented* finer-grained module ids (`<package>/cli`, `<package>/api`, ...) that didn't exist in the analyzer's output. `moduleById.get(...)` returned `undefined`, every L2 component got `files: []`, and every drill-down chain past L2 silently broke.

**Why**: Two independent defenses against the same class of problem.

- The clustering-depth fix gives Claude finer-grained module ids in the first place, so it's less likely to invent ids that miss.
- The fallback resolver tolerates the mismatch when Claude still picks ids the analyzer didn't produce — common for L2+ where Claude is reasoning about sub-systems.

**Consequences**: Module list at L1 may have more nodes than before for big single-package repos (a feature for those repos, neutral for everything else). The fallback resolver adds two prefix scans per member id, which is O(modules × members) — negligible (modules typically ≤ 30, members ≤ 6). Cache keys naturally invalidate because `modulesForPrompt` output changes when the clustering changes. Unit-tested in `tests/ai/resolve-member-files.test.ts` and `tests/analyzer/modules-adaptive.test.ts`.

---

## ADR-013: Mono-component flow tagging is a post-processing hint, not a filter (2026-05)

**Decision**: Flows where one componentId accounts for ≥ `flows.monoComponentThreshold` (default 0.8) of steps get a `meta.monoComponent = { componentId, componentLabel, share }` stamp at write time (`computeMonoComponent` in `src/ai/orchestrator.ts`). The flag is *advisory*: the sidebar dims the entry and the diagram header notes "mostly internal to X", but the flow is kept in the index and remains drill-able. The flag is also mirrored onto `DiagramIndexEntry` so the sidebar can dim without loading every diagram file.

**Context**: On the real-repo reference run (`007_Post_Launch_TODO.md` #13), the dominant flow had 8 steps and 7 referenced the same `componentId` — functionally a list of method calls on one box rather than a multi-component story. Several other flows had the same shape. Removing them entirely would have made the index 30% smaller, but also opaque: the user wouldn't know the flow exists at all.

**Why**: Demoting is reversible information; deleting is not. A user who suspects a flow was wrongly downgraded can still see it in the sidebar, click in, and judge. A user who finds the dim styling distracting can raise `monoComponentThreshold` above 1 to disable the heuristic outright. The simplest variant of the three options in the TODO (tag vs re-prompt vs drop) is also the lowest-risk: no extra AI calls, no schema bump, no behavior that depends on real-repo threshold tuning we haven't validated yet.

**Consequences**: Index entries grow by one optional field on flow rows only (~30 bytes when present). Pure function `computeMonoComponent` is exported for direct unit tests in `tests/ai/mono-component.test.ts`. The "(better)" option from the TODO (re-prompt against the dominant component's L2 sub-system) and the "(strictest)" option (drop from index) remain open follow-ups; both can build on this tagging foundation when real-repo data justifies them.

---

## ADR-007: Single npm package, not a monorepo

**Decision**: One `package.json`. CLI, server, and web frontend all live under `src/`.

**Context**: Considered a pnpm/turbo monorepo splitting `viszi-core` from `viszi-cli` and `viszi-web`.

**Why**: There's no second consumer of `viszi-core` today. The split is overhead.

**Consequences**: If we ever want a JetBrains plugin or an embeddable React component, we'll extract `viszi-core` then.

---

## ADR-014: Tree-sitter for Python + Go (closes the callsite gap from ADR-003) (2026-05)

**Decision**: Replace the regex Python and Go parsers with tree-sitter implementations behind the same `LanguageParser` interface. The JS/TS parser stays on regex.

**Context**: ADR-003 deferred tree-sitter to v0.2 over install-cost concerns (per-language WASM bundling, possible `node-gyp` breakage on Windows/musl). The intervening dogfooding showed the concrete cost of staying on regex: Python and Go parsers were emitting **empty `callsites` arrays** (documented in `005_v0.2_Features.md`), so flow diagrams for those languages were built from a strictly worse graph than JS/TS ones. Regex also misses conditional imports, decorators-as-imports, dotted attribute calls — gaps that the AI cannot route around because the *starting graph* is wrong.

**Why**: Parser quality is a floor, not a ceiling — better parsing won't make Claude smarter, but it stops feeding Claude a wrong starting graph. Tree-sitter closes both gaps at once.

The two original install-cost worries are addressed concretely:

- **Bundle size**: We use `tree-sitter-wasms` (devDep) and copy only `tree-sitter-python.wasm` (~465KB), `tree-sitter-go.wasm` (~231KB), and `tree-sitter.wasm` runtime (~186KB) into `grammars/` at build time. **~880KB total** added to the npm tarball — small enough not to register against a tool that already shells out to Claude.
- **node-gyp / npx breakage**: We never depend on the native `tree-sitter-{python,go}` packages. Only `web-tree-sitter` (WASM runtime) ships to the user. No native bindings, no `node-gyp`, no platform-specific install failures.

JS/TS stays regex because the existing parser already extracts callsites correctly and the language's normal patterns (static `import` + clear `export`) are well-served by regex. Revisiting JS is a separate decision when (and if) dynamic-import / re-export edge cases hurt real diagrams.

**Consequences**:

- `web-tree-sitter` is now a runtime dep; `tree-sitter-wasms` is a devDep used only at build time.
- `npm run build:grammars` (run as part of `npm run build` and `prepublishOnly`) copies the three WASMs into `grammars/`. The directory is gitignored — regenerated from `node_modules` so binaries don't live in git history.
- `LanguageParser.parse()` stays synchronous. The async tree-sitter setup (`Parser.init()` + `Language.load()`) is hoisted to a one-time `initTreeSitter()` call that `runAnalysis` awaits before any parsing. A shared vitest `setupFiles` does the same for the test suite.
- Behavioural drift from the regex version: Python now correctly marks `_underscore` names as `exported: false` (regex marked everything `true`). Go now captures methods, top-level consts, and top-level vars (regex only captured funcs + types).
- Callsites for Python and Go are no longer empty. Some decorator calls (e.g. `@app.route(...)` showing up as a callsite for `route`) appear as low-level noise — acceptable because the downstream had zero callsite signal previously; filtering can come later if it causes problems in real diagrams.
- The old `src/analyzer/parsers/regex_python.ts` and `regex_go.ts` are deleted. JS regex parser is unchanged.

---

## ADR-015: Optional two-stage AI pipeline (prose narrative → structured graph) (2026-05)

**Decision**: Add an opt-in `--two-stage` flag (and corresponding `OrchestratorOpts.twoStage`) that runs each AI scope through two calls instead of one:

1. **Stage 1** — `callClaudeText` (no `--json-schema`) with `buildComponentsExplanationPrompt` / `buildFlowsExplanationPrompt`. Returns a 150–250 word architectural narrative.
2. **Stage 2** — the existing `callClaude` with the existing schemas, but the stage-1 prose is injected into the prompt as a `<prior_explanation>` block that the model is told to treat as ground truth.

Both stages cache separately (`promptName: 'components-explain'` / `'flows-explain'` vs `'components'` / `'flows'`); the stage-2 cache key includes the stage-1 prose so a re-explained scope correctly invalidates the structured cache. Default is `false`; the flag must be explicitly enabled.

**Context**: Inspired by the prompt pipeline in [gitdiagram](https://github.com/ahmedkhaleel2004/gitdiagram), which splits its generation into a free-text `<explanation>` followed by a structured JSON graph. The gimli reference run (`009_Flow_UX_Improvements.md`) surfaced several quality gaps in the single-stage output — vague step labels, monolithic flows, generic component names — that match the failure mode the prose-first pattern is designed to fix. The schema-constrained call gets tunnel vision: it spends most of its capacity satisfying the schema rather than reasoning about the architecture. A prior, unconstrained call lets the model do the reasoning first, then the structured call mostly transcribes.

**Why**: Two separate behaviours emerge from one ~150-word narrative that the schema-constrained call cannot do by itself: (a) deciding *which* edges and components matter (most observed missing-edge cases were not "the model didn't know" but "the schema budget squeezed reasoning out"), and (b) naming things the way an engineer would (the narrative produces "Trade Pipeline" before "trade_pipeline service", and stage 2 then preserves that naming through the JSON). Caching stage 1 separately also means a stage-2 prompt tweak (e.g. tightening the step-quality rules) does not re-pay for the prose.

The doubling of AI cost is the obvious downside, which is why this is opt-in. The estimator (`estimateAiCalls(…, twoStage)`) is updated so the pre-flight cost preview and the progress-bar ETA reflect the 2× call count when the flag is on.

**Consequences**:

- `callClaudeText` is a new public surface in `src/ai/claude.ts` (alongside `callClaude<T>`). The two share a `runClaudeSubprocess` helper; the only differences are: no `--json-schema` arg, and `parseClaudeEnvelope(stdout, stderr, 'text')` returns the raw `result` string instead of JSON-parsing it.
- `ProgressEvent.phase: 'ai'` now carries two more `kind` values: `'components-explain'` and `'flows-explain'`. Frontend banners that switch on `kind` need to handle them (they fall through to the default progress styling today).
- The stage-2 prompt is unchanged when `explanation` is absent — single-stage runs produce byte-identical prompts and cache files to before this ADR. There is no migration cost for existing `.viszi/` outputs.
- The pattern is uniform across components and flows. If one stage's quality lift turns out to be much higher than the other's, a future flag like `--two-stage=flows-only` is a small refactor (the helper `runExplanationStage` is already factored).
- We do **not** also implement gitdiagram's validate-and-retry loop here; that's a separate decision (open in `009_Flow_UX_Improvements.md` follow-ups). The two-stage pattern alone is the smaller, more reversible step.

**Follow-ups** (not in scope of this ADR): measure stage-1 prose drift across runs (does the cache hit rate justify the separate cache, or should we collapse to one key?), and test whether stage 1 benefits from a smaller/cheaper model than stage 2 (`--model-explain` vs `--model`).
