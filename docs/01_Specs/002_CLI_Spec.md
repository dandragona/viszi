# 002 — CLI Spec

## Commands

### `viszi [path]` (default: `analyze`)

Analyse a codebase and serve interactive diagrams.

| Flag | Default | Description |
|---|---|---|
| `[path]` | `.` | Path to the codebase to analyse |
| `--levels <n>` | `2` | Tier depth (1–5). 1 = global only; 2 = global + per-component; 3+ = recursively deeper |
| `--no-flows` | flows on | Skip flow-diagram generation |
| `--root-scope <relpath>` | repo root | Treat `<relpath>` (under `[path]`) as the L1 root. Useful for `src/<one-package>/...` shaped repos where the L1 would otherwise collapse into a single giant component. viszi also auto-suggests this flag at the end of an L1 run when one component holds ≥ 75% of the LOC. |
| `--output <dir>` | `<path>/.viszi` | Where to write the JSON output |
| `--port <n>` | auto | HTTP server port |
| `--no-open` | open | Don't auto-open the browser |
| `--no-serve` | serve | Generate diagrams only — don't start the server |
| `--concurrency <n>` | adaptive (`min(8, max(4, cpus))`) | Parallel `claude` subprocess calls within a tier. Cross-tier overlap (L1 flows in parallel with L2 system fanout) can briefly bring effective concurrency to 2×. |
| `--max-budget-usd <n>` | unbounded | Per-call USD budget cap; omitted by default so `claude` runs with no per-call cap. Pass a number (e.g. `0.5`) to forward `--max-budget-usd` to `claude`. |
| `--no-cache` | cache on | Disable on-disk response cache |
| `--dry-run` | off | Skip Claude entirely; emit synthetic stub diagrams. Useful for offline dev or estimating output structure |
| `--bare` | off | Run `claude` in `--bare` mode (skip hooks/MCP/CLAUDE.md). Off by default because `claude --bare` also disables OAuth/keychain auth — requires `ANTHROPIC_API_KEY` to be set. |
| `--two-stage` | off | Two-stage prompt pipeline: first call returns a free-text architectural narrative, second call (schema-constrained) is seeded with that narrative as `<prior_explanation>`. Doubles AI calls (and cost). Tends to produce better component names, edge selection, and step labels. See ADR-015. |
| `--model <name>` | claude default | Override the Claude model alias (`opus`, `sonnet`, etc) |
| `-v, --verbose` | off | Verbose progress output |
| `-q, --quiet` | off | Errors only |

### `viszi serve [path]`

Re-open an existing analysis without regenerating.

| Flag | Default | Description |
|---|---|---|
| `[path]` | `.` | The codebase whose `.viszi/` should be served |
| `--output <dir>` | `<path>/.viszi` | |
| `--port <n>` | auto | |
| `--no-open` | open | |

### `viszi clear [path]`

Remove the `.viszi/` directory (caches and diagrams).

### `viszi regen <diagram-id> [path]`

Invalidate one diagram's on-disk cache entry and re-run only that AI call. Every diagram now stores its cache key in `meta.regenCacheKey`; `regen` reads it, deletes the matching `.viszi/cache/<file>.json`, then re-invokes the analyser. Because the cache stays warm for every *other* diagram, only the one targeted call actually hits Claude.

| Flag | Default | Description |
|---|---|---|
| `<diagram-id>` | (required) | Id of the diagram to regenerate. Visible in the URL (`/d/<id>`) and as `id` inside any diagram JSON. |
| `[path]` | `.` | Repo whose `.viszi/` holds the analysis |
| `--output <dir>` | `<path>/.viszi` | Output directory |
| `-v, --verbose` | off | Verbose logging |
| `-q, --quiet` | off | Errors only |

Each diagram view in the UI also has a `Regenerate` button (top-right) that copies the matching `viszi regen <id>` command to the clipboard — convenient for prompt-tuning loops.

### `viszi export [path]`

Bundle an existing analysis into a single self-contained `.html` file.

| Flag | Default | Description |
|---|---|---|
| `[path]` | `.` | Codebase whose `.viszi/` should be exported |
| `--output <dir>` | `<path>/.viszi` | Source analysis directory |
| `--out <file>` | `<name>-viszi.html` in cwd | Output HTML path |

### `viszi init [path]`

Write a starter `.viszi.json` (and optionally a `.viszi-ignore`) at the given path. Useful as a discoverable starting point: every supported field is shown as a commented example with its default. The default behaviour refuses to overwrite an existing `.viszi.json` — pass `--force` to replace it.

| Flag | Default | Description |
|---|---|---|
| `[path]` | `.` | Directory to write the config into |
| `--force` | off | Overwrite an existing `.viszi.json` / `.viszi-ignore` |
| `--with-ignore` | off | Also write a `.viszi-ignore` template alongside the config |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Bad arguments / invalid path |
| 2 | Analysis failed (Claude unavailable, parse error, etc.) |
| 3 | Server failed |

## Examples

```
viszi .
viszi ./apps/web --levels 3 --concurrency 8
viszi . --no-flows --no-open
viszi . --dry-run                    # offline stubs
viszi . --two-stage                  # higher-quality output via prose-then-structured pipeline (2x AI calls)
viszi . --model opus --max-budget-usd 1.0
viszi serve ./somewhere
viszi export . --out my-system.html  # single shareable HTML
viszi clear .
viszi init .                         # write a starter .viszi.json
viszi init . --with-ignore --force   # also write .viszi-ignore, overwriting any existing files
```

## Help text

`viszi --help` produces auto-generated help from Commander, with an Examples block appended.
