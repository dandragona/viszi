# CLAUDE.md — guidance for AI assistants working in this repo

This file is loaded automatically into Claude Code sessions started inside this repository. It encodes the conventions that aren't otherwise discoverable from the source.

## Source of truth

- **Product / UX behaviour:** `docs/01_Specs/` (versioned, numbered).
- **Architecture & internals:** `docs/02_Architecture/`. Treat `006_Decisions.md` as the ADR log — append to it (don't rewrite past entries) when an architecturally relevant decision is made.
- The README is the public face — keep it user-focused, not developer-focused.

## Working style

- **Use jujutsu** (`jj`) for version control where possible. The repo is a git colocated repo; standard `git` commands also work when needed.
- **Update docs alongside code.** Any change that adds a feature, alters a public flag, or shifts an architectural boundary must update the corresponding file under `docs/`. If you create a new module or pipeline stage, document it in `docs/02_Architecture/`.
- **No dead code / no TODOs in committed code.** Either implement it or open an item in `docs/01_Specs/006_Public_Launch_Checklist.md`.

## Key invariants

- **All inference goes through `src/ai/claude.ts`.** viszi never imports the Anthropic SDK directly; it shells out to the user's local `claude` CLI. If you find yourself importing `@anthropic-ai/sdk`, stop and use `callClaude()` instead.
- **Parsers implement `LanguageParser`** (`src/analyzer/parsers/types.ts`). Add a new language by registering a parser in `src/analyzer/parsers/index.ts`. Parsers are regex-based today; that's intentional (no heavyweight tree-sitter runtime at install time).
- **`SCHEMA_VERSION` must bump** in `src/ai/schemas.ts` whenever the AI prompt **or** the JSON schema passed to Claude changes. The cache key includes this version, so a bump invalidates stale responses.
- **`.viszi/` is the only directory viszi writes to.** Never write to the analysed repo outside of `<repoRoot>/.viszi/` (or the user-supplied `--output`).
- **Diagrams are immutable once written.** The writer streams them out for live progress; downstream readers should treat them as append-only.

## Iterating locally

- `npm run build` builds CLI + web bundle. `npm run build:cli` / `npm run build:web` are the halves.
- `npm run typecheck` runs the project's two `tsc -p` passes (CLI + web).
- `npm run dev:web` is the Vite frontend dev server (but it needs an existing analysis to render).
- **Offline iteration**: `node bin/viszi.js <path> --dry-run` generates synthetic diagrams without hitting Claude. Use it for analyzer, layout, and UI work.
- The smoke command is `npm run smoke` (`viszi --help`).

## Where things live

| Concern | Path |
|---|---|
| CLI entry + commands | `src/cli/` |
| Analyzer (scan, parse, graph, modules, entrypoints) | `src/analyzer/` |
| AI orchestration + cache + schemas | `src/ai/` |
| Output writer + diagram types | `src/model/` |
| Fastify server + websocket bus | `src/server/` |
| React SPA | `src/web/` |
| Shared utilities | `src/shared/` |

## Public-launch checklist

`docs/01_Specs/006_Public_Launch_Checklist.md` is the running list of pre-launch work. When closing a checklist item, tick its box in that file in the same change.
