# viszi

**AI-powered, multi-tiered, interactive system & flow diagrams for any codebase.**

`viszi` analyses a codebase and generates a navigable browser-based view of how it's structured and how data flows through it. Click any component to drill down a level. Click any step in a flow to see the sub-flow that runs underneath it.

It runs locally and uses **your own Claude Code CLI** for inference — no separate API key required.

## Install & run

```bash
npx viszi /path/to/your/codebase
# or
npm install -g viszi
viszi /path/to/your/codebase
```

A browser tab opens at `http://localhost:<auto>` showing the diagrams.

## Quick example

```bash
# Analyse the current directory with 2 tiers (the default)
viszi .

# Go three tiers deep, allow up to 8 parallel Claude calls
viszi ./my-monorepo --levels 3 --concurrency 8

# Generate diagrams but don't open the browser (CI use)
viszi . --no-open --no-serve

# Re-open an existing analysis without re-running Claude
viszi serve .
```

## How tiering works

`--levels N` controls how deeply diagrams nest:

| Level | What you get |
|---|---|
| 1 | One global system diagram + one diagram per important flow |
| 2 | …plus a child diagram for **every component** in the global view, and a sub-flow diagram for every flow step |
| 3+ | …recursively, until you reach the file/function level |

Every node and every flow step in a parent diagram is **clickable** — clicking navigates you into its child diagram.

## Requirements

- Node.js ≥ 20
- [Claude Code CLI](https://docs.claude.com/en/docs/claude-code/overview) on your `PATH` (the `claude` command).

## Configuration

Drop a `.viszi.json` at your repo root to override module groupings, exclude paths, or cap the AI budget. See `docs/01_Specs/004_Config_Spec.md`.

## How it works

1. **Deterministic scan.** `viszi` walks your repo (honouring `.gitignore`), parses each file with tree-sitter, builds a dependency graph, and detects entry points.
2. **AI labelling.** It then asks Claude Code (via `claude -p --json-schema …`) to cluster files into named components, identify important flows, and write short descriptions.
3. **Recursion.** For every component in the parent diagram, it repeats steps 1–2 scoped to that component, until it hits `--levels`.
4. **Render.** The resulting JSON is served by a tiny local Fastify server to a React Flow front-end.

See `docs/02_Architecture/` for the full design.

## License

MIT
