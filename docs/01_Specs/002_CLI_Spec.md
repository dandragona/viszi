# 002 — CLI Spec

## Commands

### `viszi [path]` (default: `analyze`)

Analyse a codebase and serve interactive diagrams.

| Flag | Default | Description |
|---|---|---|
| `[path]` | `.` | Path to the codebase to analyse |
| `--levels <n>` | `2` | Tier depth (1–5). 1 = global only; 2 = global + per-component; 3+ = recursively deeper |
| `--no-flows` | flows on | Skip flow-diagram generation |
| `--output <dir>` | `<path>/.viszi` | Where to write the JSON output |
| `--port <n>` | auto | HTTP server port |
| `--no-open` | open | Don't auto-open the browser |
| `--no-serve` | serve | Generate diagrams only — don't start the server |
| `--concurrency <n>` | `4` | Parallel `claude` subprocess calls |
| `--max-budget-usd <n>` | `0.50` | Per-call USD budget cap (passed to `claude --max-budget-usd`) |
| `--no-cache` | cache on | Disable on-disk response cache |
| `--dry-run` | off | Skip Claude entirely; emit synthetic stub diagrams. Useful for offline dev or estimating output structure |
| `--bare` | on | Run `claude` in `--bare` mode (skip hooks/MCP/CLAUDE.md). On by default for predictable analysis |
| `--no-bare` | | Use the user's full Claude environment |
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

### `viszi export [path]`

Bundle an existing analysis into a single self-contained `.html` file.

| Flag | Default | Description |
|---|---|---|
| `[path]` | `.` | Codebase whose `.viszi/` should be exported |
| `--output <dir>` | `<path>/.viszi` | Source analysis directory |
| `--out <file>` | `<name>-viszi.html` in cwd | Output HTML path |

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
viszi . --model opus --max-budget-usd 1.0
viszi serve ./somewhere
viszi export . --out my-system.html  # single shareable HTML
viszi clear .
```

## Help text

`viszi --help` produces auto-generated help from Commander, with an Examples block appended.
