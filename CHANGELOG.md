# Changelog

All notable changes to viszi are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **`--bare` is now opt-in** (was default-on). `claude --bare` disables OAuth/keychain auth and requires `ANTHROPIC_API_KEY`; since viszi assumes the user is already authenticated via Claude Code, defaulting `--bare` on broke the first-run experience for the modal OAuth user. The `--no-bare` flag is removed (no longer needed). See ADR-006 for the revised reasoning.
- **`--max-budget-usd` default removed.** The CLI no longer ships a $0.50 per-call cap; if you don't pass the flag, viszi forwards nothing to `claude --max-budget-usd` and `claude` runs uncapped. Pass `--max-budget-usd 0.5` (or any number) to re-impose a cap.

### Fixed
- Claude CLI compatibility (`2.1.x`): `--add-dir` is variadic in current builds and was swallowing the prompt; viszi now passes `--add-dir=<path>` (one flag per dir, `=` form) so the prompt remains unambiguously positional.
- Envelope parsing: prefer `envelope.structured_output` over `envelope.result` when present, since current `claude -p --json-schema` builds return the schema-conformant payload in `structured_output` and a free-text summary in `result`. Falls back to `result` for older builds. See ADR-010.

### Added
- SIGINT (Ctrl-C) handler in `src/cli/commands/analyze.ts` that propagates SIGTERM to in-flight `claude` subprocesses (via `terminateInflightClaude()` in `src/ai/claude.ts`), closes the Fastify server, and exits with code 130. Completed cache entries persist; re-runs resume from cache. See ADR-010 and `docs/02_Architecture/003_AI_Orchestration.md`.

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
