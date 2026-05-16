# 002 — Analyzer Pipeline

The analyzer turns a directory into a structured **dependency graph + module clusters + entry points** with no AI involvement.

## Stage A: Discovery (`traverse.ts`)

- `globby` walks the repo with `onlyFiles: true` and `followSymbolicLinks: false`.
- Always-excluded paths: `node_modules`, `.git`, `.jj`, build outputs (`dist`, `build`, `target`, `out`, `.next`, `.svelte-kit`, …), Python venvs and caches, IDE caches, `vendor/`, `coverage/`, and the tool's own `.viszi/`.
- The repo's `.gitignore` and an optional `.viszi-ignore` are loaded via the `ignore` package.
- Files larger than 1 MB are skipped (probably generated).
- Each file is annotated with its detected `Language`.

## Stage B: Parsing (`parsers/`)

The first version uses **regex parsers** rather than tree-sitter. This is a deliberate choice for v0.1:
- Regex parsers ship as plain TS, no native bindings or WASM grammars to bundle.
- They're "good enough" for finding imports, top-level functions/classes, and HTTP handlers — the inputs the AI needs.
- The `LanguageParser` interface (in `parsers/types.ts`) is designed so a tree-sitter implementation can be dropped in later without changing call sites.

Parsers exist for:
- `regex_js.ts` — TS/TSX/JS/JSX (imports, requires, dynamic imports, exports, Express/Fastify/Next.js handlers)
- `regex_python.ts` — Python (imports, defs, classes, Flask/FastAPI/Django handlers)
- `regex_go.ts` — Go (single + multi imports, funcs, types, `net/http` and mux/chi handlers)

Each parser returns a `ParsedFile` containing `imports`, `symbols`, `httpHandlers`, `cliCommands`, `loc`.

## Stage C: Resolution (`resolve.ts`)

Best-effort resolution from raw import strings to absolute file paths inside the repo. Strategy by language:
- **Relative imports** (`./foo`, `../foo`): resolve from the importing file, try common extensions and `index.<ext>`.
- **Python dotted modules**: convert dots to slashes, look under repo root.
- **Go imports**: try the trailing two segments under repo root (works for monorepo internal packages; external imports return `undefined`).
- **JS path aliases** (`@/foo`, `~/foo`, `src/foo`): treat as repo-root-relative.

External imports (npm packages, pip packages, Go modules) return `undefined` and become "external" — they don't add edges in the dependency graph.

## Stage D: Graph (`graph.ts`)

A directed `graphology` graph: nodes = files (keyed by repo-relative path), edges = resolved imports with a `weight` count.

Each file node carries: `language`, `loc`, `symbolCount`, `exportedSymbols`, `httpHandlerCount`.

## Stage E: Modules (`modules.ts`)

Files are clustered into modules using a heuristic:
- If the path is `src/<sub>/...`, `lib/<sub>/...`, `app/<sub>/...`, `internal/<sub>/...`, `pkg/<sub>/...`, etc., the module is the first two segments (`src/auth`, `lib/db`).
- Otherwise the module is the file's top-level directory.
- Files at the very root are bucketed into `__root__`.
- **Adaptive depth:** if the initial bucket would contain more than `FILES_PER_MODULE_LIMIT` files (default 25), the cluster descends one segment deeper so single-package repos (`src/<one-package>/...`) don't collapse into a single giant module. See ADR-011.

Each `Module` carries: file list, total LOC, sample exported symbols (up to 32), HTTP handler count, and the set of other modules it imports from.

`modulesForPrompt()` produces the compact JSON shape sent to Claude.

## Stage F: Entrypoints (`entrypoints.ts`)

Pulled from multiple signals:
- `package.json` `main`, `module`, `bin`, `exports`, `types` fields.
- `pyproject.toml` `[project.scripts]` (regex parsing — no toml dependency).
- HTTP handlers detected by parsers.
- Filename heuristics: `main`, `cli`, `index`, `server`, `app` → init; `cron`/`worker`/`consumer`/`job`/`queue` → cron; `listener`/`handler`/`subscribe` → event.

Deduplicated and sent into the flow-identification prompt.

## What the analyzer does **not** do

- No call-graph extraction (only import-graph). Adding cross-function calls would need a real AST and is out of scope for v0.1.
- No type-aware resolution (no `tsconfig` `paths` evaluation, no `.d.ts` chasing).
- No semantic understanding — that's Claude's job.
