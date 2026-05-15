# 001 — Product Vision

## What is viszi?

`viszi` is an AI-powered command-line tool that turns any codebase into an interactive, multi-tiered set of system and flow diagrams that can be navigated in a browser.

The user runs `viszi /path/to/codebase` and gets a local web UI showing:
- A **system diagram** of the whole codebase: components and their relationships.
- A **flow diagram** for each important flow the codebase implements.
- The ability to **click any component** in a system diagram to drill into a more granular sub-diagram of that component's internals.
- The ability to **click any step** in a flow to drill into the sub-flow that runs underneath it.

The depth of drill-down is controlled by `--levels N` (1–5).

## Who is it for?

- **Engineers joining a new codebase** who want a live map of the territory before they read code.
- **Architects** doing a refactor or system review who need to see the lay of the land at multiple zoom levels.
- **Tech leads** explaining a system in a planning meeting or onboarding session.
- **AI agents and tooling developers** who want to ground their context in a structured representation of a project.

## Non-goals (v0.1)

- Realtime sync with the codebase as files change. (Future: a `--watch` mode.)
- Generating production architecture documents. (Output is exploratory, not authoritative.)
- Replacing hand-drawn architecture diagrams; viszi is a discovery aid, not a system of record.
- Embedding in CI as a quality gate.

## Why now?

Existing visualisation tools (Mermaid in markdown, hand-drawn boxes, IDE-built call graphs) either require manual upkeep or produce raw, unlabelled graphs that are hard to read. With locally-installed AI CLIs (Claude Code) now ubiquitous, we can let the model do the **labelling, grouping, and naming** work that humans previously did by hand, while keeping the deterministic graph extraction in code.

## Design principles

1. **Deterministic first, AI second.** File traversal, parsing, and dependency-graph construction happen in code. The AI is asked to *label and group* a structured input, not to invent the structure from scratch.
2. **No new credentials.** viszi shells out to the user's already-installed `claude` CLI. No API keys, no separate billing.
3. **Easy install.** A single `npx viszi <path>` command should work end-to-end.
4. **Cacheable.** Re-running on an unchanged repo should be free (cache-only).
5. **Visually appealing by default.** Dark theme, custom node types per kind, smooth interactions.

## Success looks like

A user runs `npx viszi .` on a real codebase they don't know, lands in a browser, and within 60 seconds has a meaningful mental model of the system's main components and how a request flows through it.
