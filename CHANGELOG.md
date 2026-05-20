# Changelog

All notable changes to viszi are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] — 2026-05-17

The **v0.3-flows milestone** — the flow viewer rebuilt around "who runs what,
in what order, and what does each step *mean*." Five items from `docs/01_Specs/009_Flow_UX_Improvements.md`.

### Added

- **Vertical flow layout with component swim lanes (009 #1).** Flow diagrams now run top-to-bottom with one column per unique `componentId` (first-appearance order). Lane headers across the top show component icon + label + step count. Cross-lane edges (componentId source ≠ target) get a heavier dashed blue stroke so the architecturally interesting hops stand out from in-lane chains. Mono-component flows collapse to a single column. ELK is bypassed for `kind: 'flow'` (manual swim-lane positioning is cleaner than fighting ELK partitioning); system diagrams still use ELK.
- **Step card redesign (009 #3).** Component moved from the smallest text on the card to a left lane-chip (80px, kind-coloured rail with the icon stacked above the label). Whole card is the drill target; inline "drill in →" microcopy gone; corner chevron retained as the drill affordance. Step description renders on the card in a faded block below the action.
- **Step descriptions per flow node (009 #9).** `description` is now required on every step in `FlowsSchema` / `SubFlowSchema`. Prompt rewritten with GOOD/BAD examples that push *why* over *what*.
- **Step → file linkage (009 #8).** Schema gains an optional `files: string[]` (max 5) per step. Prompt asks the model to cite 1–2 file paths drawn verbatim from the component's `members[]`. Card renders a `[N files]` chip that opens `FilesPanel` scoped to the step. `mergeConsecutiveSimilarSteps` unions citations when collapsing.
- **Inline sub-flow expansion as split-pane (009 #4).** Drilling into a sub-flow no longer replaces the parent page. The chevron in a step's top-right toggles a slide-in panel on the right (`SubFlowPanel`) that renders the sub-flow inline; parent canvas stays visible on the left. Hovering a drillable step shows a "↘ N sub-steps · A → B → C" preview chip (debounced 120ms, session-cached). State is URL-hash persisted as `expand=<stepId>` for deep-linking. Card-body click still navigates to the sub-flow as its own page (fallback).
- **Sidebar flow grouping + shape glyphs (009 #5 + #6).** Sub-flows under a parent flow sort by `flowOrder` (the parent step's `order`) instead of alphabetically — added as a new optional field on `DiagramIndexEntry`, populated by a second pass in the writer. Top-level flows within each trigger group sort by title. Every flow index entry gets a `shape: ComponentKind[]` — the per-step component-kind sequence — rendered by the sidebar as a thin row of 5px coloured squares (truncated to 7 with `…`). Tooltip reads "N steps · M unique components".

### Changed

- `SCHEMA_VERSION` bumped from `3` → `4`. Caches generated under v0.2 are invalidated (the flow prompt and `FlowsSchema` both changed).
- Sidebar `tree-chevron-empty` no longer renders the `·` bullet on leaf rows — it's an empty placeholder with reserved width. Parent vs. leaf distinction is now unambiguous.
- `DiagramIndexEntry` gains `shape?: ComponentKind[]` and `flowOrder?: number`.
- `FlowStep` gains `files?: string[]`.

### Notes

- See `docs/01_Specs/009_Flow_UX_Improvements.md` for the full milestone tracking. Open items in 009: #2 (trigger node), #7 (WebSocket spam in serve mode), #10–#13 (L1 flow surfacing, breadcrumb, mini-map, regenerate-fires).
- The pre-0.3.0 `[Unreleased]` items (`--bare` opt-in, `--max-budget-usd` default removed, `--add-dir` compatibility, envelope parsing, SIGINT handler) have not yet shipped a release — they ride this version too.

### Previously Unreleased (now in 0.3.0)

- **`--bare` is now opt-in** (was default-on). `claude --bare` disables OAuth/keychain auth and requires `ANTHROPIC_API_KEY`; since viszi assumes the user is already authenticated via Claude Code, defaulting `--bare` on broke the first-run experience for the modal OAuth user. The `--no-bare` flag is removed. See ADR-006.
- **`--max-budget-usd` default removed.** The CLI no longer ships a $0.50 per-call cap; if you don't pass the flag, viszi forwards nothing to `claude --max-budget-usd` and `claude` runs uncapped.
- Claude CLI compatibility (`2.1.x`): `--add-dir` is variadic in current builds and was swallowing the prompt; viszi now passes `--add-dir=<path>` (one flag per dir, `=` form).
- Envelope parsing: prefer `envelope.structured_output` over `envelope.result` when present. Falls back to `result` for older builds. See ADR-010.
- SIGINT (Ctrl-C) handler in `src/cli/commands/analyze.ts` propagates SIGTERM to in-flight `claude` subprocesses, closes the Fastify server, exits 130. Completed cache entries persist. See ADR-010.
- **Tree-sitter parsers for Python and Go (ADR-014).** Real syntax-tree parsing replaces the previous regex stubs. `LanguageParser` interface added; `initTreeSitter()` loads the WASM grammars once.
- **Two-stage AI pipeline (ADR-015).** Optional `--two-stage` mode: first a free-text architectural narrative, then the schema-constrained call uses the narrative as context. Roughly doubles AI calls but tends to produce sharper component names, edge selection, and step labels.

## [0.2.0] — 2026-05-15

### Added
- **Call-graph analysis.** The analyzer now extracts function-call edges in addition to import edges for JS/TS. Module-level prompts include a `callsModules` field so Claude can emit `kind: 'calls'` edges alongside `kind: 'imports'` edges. Python and Go parsers ship in v0.1 form (empty `callsites`) pending tree-sitter integration.
- **Static HTML export.** `viszi export [path] [--out viszi.html]` produces a single self-contained HTML file containing the React bundle, dark theme CSS, and every diagram inlined as JSON inside `window.__VISZI_DATA__`. Fully shareable; works offline.
- **Search palette.** Cmd-K / Ctrl-K opens a fuzzy search modal indexing every diagram, component, and flow step. Keyboard nav (↑ / ↓, ↵, Esc) and URL-encoded selection (`/d/<id>?focus=<anchor>`).
- **Live progress over WebSocket.** Default `--serve` mode now boots the server before the analysis starts. A new `EventBus` bridges the orchestrator and `/ws/progress` subscribers, so the browser opens immediately and streams progress + new diagrams as they're generated. Reconnects with 2s backoff after disconnects.
- **`--dry-run` flag.** Skip Claude entirely and emit synthetic stub diagrams. Useful for offline iteration and CI smoke tests.
- **`--bare` flag** (default on). Run `claude` in `--bare` mode (skip hooks/MCP/CLAUDE.md) for predictable analysis. Use `--no-bare` to opt into the user's full environment.

### Changed
- `SCHEMA_VERSION` bumped from `1` → `2`. Caches generated under v0.1 are invalidated.
- `DepEdgeAttrs` gained `importCount` + `callCount`. `weight` is now their sum (kept for backwards compatibility).
- The `ParsedFile` shape gained `callsites: CallsiteRef[]`. Every parser sets this.

### Notes
- See `docs/01_Specs/005_v0.2_Features.md` and `docs/02_Architecture/` for design details.

## [0.1.0] — 2026-05-15

### Added
- Initial walking skeleton:
  - Repo traversal honouring `.gitignore` and `ALWAYS_EXCLUDE`, with a 1 MB file-size cap.
  - Regex-based parsers for TypeScript, JavaScript, JSX/TSX, Python, and Go (imports, symbols, HTTP handlers).
  - Dependency graph (`graphology`) with module clustering and entrypoint detection.
  - AI orchestrator that shells out to `claude -p --json-schema` for component clustering and flow extraction.
  - On-disk response cache keyed by `(promptName, scope, level, schemaVersion, contentHash)`.
  - Fastify server with React Flow front-end, ELK layout, dark theme.
  - CLI commands: `analyze` (default), `serve`, `clear`.
