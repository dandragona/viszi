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

## Privacy — what gets sent to Anthropic

`viszi` calls Anthropic only through your **local Claude Code CLI** (the `claude` command on your `PATH`). It does not import the Anthropic SDK or use a separate API key. Inference is billed against whatever account your Claude Code is already authenticated as.

**What gets sent.** Each AI call ships a **structural summary** that the analyzer builds locally — module ids, file paths, LOC counts, exported symbol names (regex-extracted identifiers), HTTP handler routes, and inter-module import/call edges. Claude Code is also given read access to the analysed directory (`--add-dir`), so the underlying Claude session may read source files on demand to refine its answer.

**What does not get sent.** `viszi` does not bulk-upload raw file contents. It does not exfiltrate files outside the analysed directory. It does not send environment variables, dotfiles outside the repo, or anything from your shell history.

**Opt out of inference entirely.** Run with `--dry-run` to preview the UI with synthetic stub diagrams and **no network call to Anthropic at all**:

```bash
viszi . --dry-run
```

**Optional `--bare` mode.** By default `viszi` runs `claude` in its normal mode, so your existing Claude Code OAuth session is used and your project `CLAUDE.md` / hooks / MCP servers apply as usual. Pass `--bare` to suppress all of that for fully predictable analysis — but note that `claude --bare` also disables OAuth, so `--bare` requires `ANTHROPIC_API_KEY` to be set.

See [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy) and the [Claude Code documentation](https://docs.claude.com/en/docs/claude-code/overview) for what Claude Code itself does with the conversation.

## License

MIT
