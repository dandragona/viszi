# Contributing to viszi

Thanks for taking the time to look at this. The pre-launch checklist is in `docs/01_Specs/006_Public_Launch_Checklist.md` — that's where unfinished work is tracked.

## Setup

Requirements:
- Node.js ≥ 20 (a `.nvmrc` is provided — `nvm use` picks the pinned major).
- [Claude Code CLI](https://docs.claude.com/en/docs/claude-code/overview) on your `PATH` if you want to run viszi end-to-end. For most analyzer/UI work you can use `--dry-run` (see below) and skip Claude entirely.

```bash
git clone https://github.com/dandragona/viszi.git
cd viszi
npm install
npm run build
```

## The dev cycle

| Command | What it does |
|---|---|
| `npm run build` | Build the CLI + the React SPA. |
| `npm run build:cli` / `npm run build:web` | Build just one half. |
| `npm run dev:web` | Vite frontend dev server (needs an existing `.viszi/` to render against). |
| `npm run dev:cli` | `tsc --watch` for the CLI. |
| `npm run typecheck` | Two `tsc -p` passes (cli + web), no emit. |
| `npm run lint` | ESLint over `src/**/*.{ts,tsx}`. |
| `npm run format` / `npm run format:check` | Prettier write / verify. |
| `npm run test` | Vitest (unit + integration). |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run smoke` | `viszi --help` end-to-end. |

CI runs lint → typecheck → build → test → smoke across Node 20 + 22 on Linux/macOS/Windows. A second job asserts `npm pack` stays under 2 MB and contains `dist/web/`.

## Trying viszi against a fixture

The repo ships with a small fixture at `tests/fixtures/sample-repo`. The fastest way to exercise the whole pipeline without Claude:

```bash
node bin/viszi.js tests/fixtures/sample-repo --dry-run --no-open --output /tmp/sample-viszi
```

That writes `index.json` + per-diagram JSON under `/tmp/sample-viszi/`. To view it in the browser:

```bash
node bin/viszi.js serve tests/fixtures/sample-repo --output /tmp/sample-viszi
```

(Drop `--no-open` to auto-launch a browser tab.)

## Repository layout

```
src/
  cli/        Commander entry + per-subcommand handlers
  analyzer/   Repo traversal, parsers, graph, modules, entrypoints
  ai/         claude.ts (subprocess), orchestrator.ts, prompts/, schemas.ts, cache.ts
  model/      Diagram types + writer
  server/     Fastify server, routes, websocket bus
  web/        React SPA (Vite-built)
  shared/     paths, version
docs/
  01_Specs/   What viszi does (product / CLI / config)
  02_Architecture/  How it works (analyzer pipeline, AI, frontend, server, ADRs)
tests/
  fixtures/   Sample repos for integration tests
  analyzer/   Parser, traversal, graph, module, entrypoint tests
  ai/         Cache + schema + SIGINT tests
  cli/        Export-pipeline tests
  integration/ End-to-end --dry-run smoke
```

## Adding a new language parser

Parsers implement the `LanguageParser` interface (`src/analyzer/parsers/types.ts`):

```ts
export interface LanguageParser {
  language: Language | Language[];
  parse(absPath: string, relPath: string, source: string): ParsedFile;
}
```

1. Add the file extension(s) to `EXT_TO_LANG` and the `PARSEABLE` set in `src/analyzer/languages.ts`.
2. Write a parser in `src/analyzer/parsers/regex_<lang>.ts` that returns imports, exported symbols, HTTP handlers, and (ideally) callsites.
3. Register it in `src/analyzer/parsers/index.ts`.
4. Wire the import-resolution rules into `src/analyzer/resolve.ts` if the language has non-trivial module paths.
5. Add unit tests under `tests/analyzer/parsers.test.ts`.

The existing parsers are regex-based on purpose: viszi avoids the install footprint of tree-sitter at runtime. If a parser becomes too noisy, the right move is a tighter regex, not a heavier engine.

## Bumping the AI schema

If you change a prompt or the JSON schema in `src/ai/schemas.ts`, **bump `SCHEMA_VERSION`** in the same commit. The cache key includes the version, so the bump invalidates stale responses on existing user installs.

## Architecture changes

When you change architecture, update the relevant file under `docs/02_Architecture/`. Material decisions go in `docs/02_Architecture/006_Decisions.md` as an appended ADR — do not rewrite history.

## Commit style

Conventional-ish: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`. PRs that close a checklist item should reference the item number, e.g. `feat: viszi init (closes 006 item 13)`.

## Reporting bugs

Use the bug-report template under `.github/ISSUE_TEMPLATE/`. Include the viszi version (`viszi -V`), the Node version, the OS, and either a public repo URL or a minimal reproduction.
