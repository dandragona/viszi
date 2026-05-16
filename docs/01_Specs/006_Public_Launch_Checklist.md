# 006 — Public Launch Checklist

Work required before viszi is advertised publicly. Numbering is from the original triage; items 3, 4, 10, 14, 15, 16 from that triage are deferred or tracked separately.

Each item is a short **Gap** statement followed by a checklist of concrete actions.

---

## 1. Tests and CI

**Gap:** zero `.test.ts` files in the repo and no CI. Regressions will land unnoticed; a single edge case in a real repo can silently produce broken diagrams.

- [x] Add a test runner (Vitest fits the TS/Vite stack).
- [x] Smoke test: `viszi --dry-run` against a fixture repo, asserting `index.json` + ≥1 diagram are produced and validate against the diagram types.
- [x] Unit tests for `src/analyzer/`: `traverse` (honours `.gitignore`, size cap, `ALWAYS_EXCLUDE`), each parser (`regex_js`, `regex_python`, `regex_go`), `graph` (resolved imports + call edges), `modules` (clustering), `entrypoints` (detection heuristics).
- [x] Unit tests for `src/ai/cache.ts`: key shape, hit/miss, `SCHEMA_VERSION` invalidation.
- [x] Schema-roundtrip test: a known Claude response validates against `ComponentsSchema` / `FlowsSchema` in `src/ai/schemas.ts`.
- [x] GitHub Actions workflow: typecheck, build, test on Node 20 + 22, across `ubuntu-latest`, `macos-latest`, `windows-latest`.
- [x] CI step that runs `npm pack` and asserts the tarball stays under ~2 MB and contains `dist/web/`.

## 2. README screenshot, GIF, and live demo

**Gap:** the README has no images. viszi is a visual tool — users decide in seconds whether to try it.

- [ ] Pick a recognisable OSS repo (e.g. `vite`, `fastify`, `express`) and run `viszi export` against it.
- [ ] Host the resulting HTML on GitHub Pages.
- [ ] Capture (a) a screenshot of the root system diagram and (b) a short animated GIF showing tier drill-down + the Cmd-K search palette.
- [ ] Embed both at the top of the README, above the install section.
- [ ] Add the live-demo URL to `package.json#homepage` and to the README.

## 5. Privacy and data disclosure

**Gap:** the README does not mention that codebase content is sent to Anthropic via the Claude CLI. Users have a right to know before running this.

- [x] Add a "Privacy" / "What gets sent" section to the README:
  - viszi sends pre-summarised module/file/entry-point info to Anthropic via the user's local Claude Code CLI.
  - Raw file contents are not bulk-uploaded; only the structural summary the analyzer builds.
  - Inference uses whatever auth the user's Claude Code already has — no separate API key.
  - Users can run `--dry-run` to preview the UI without sending anything.
- [x] Link Anthropic's privacy policy for completeness.

## 6. `package.json` metadata and versioning

**Gap:** the npm tarball is missing pointers users expect, and the version is stale relative to the shipped feature set in `005_v0.2_Features.md`.

- [x] Add `repository.type` / `repository.url`, `bugs.url`, `homepage`.
- [x] Add `keywords`: e.g. `["codebase", "architecture", "diagram", "visualization", "claude", "ai", "system-diagram", "flow-diagram"]`.
- [x] Add `publishConfig.access: "public"`.
- [x] Bump `version` to `0.2.0` to reflect v0.2 features.
- [x] Add `CHANGELOG.md` with entries for v0.1.0 and v0.2.0, derived from the spec docs and git log.

## 7. Lint and format

**Gap:** no eslint, no prettier. Contributors won't know the style; PRs will drift.

- [x] Adopt `eslint` + `@typescript-eslint` + `eslint-config-prettier` and `prettier`.
- [x] Minimal config: ban unused vars, prefer-const, no `console` outside `src/cli/` and `src/server/`.
- [x] Add `npm run lint` and `npm run format` scripts.
- [x] Run `npm run lint` in CI (item 1).

## 8. Static HTML export XSS audit

**Gap:** `viszi export` inlines diagram JSON into a `<script>` tag. `jsonForScript()` (`src/cli/commands/export.ts`) escapes only `</script>` and `</style>`. If any React component renders Claude-supplied strings unsafely, a hostile codebase could embed a payload that fires when someone else opens the exported `.html`.

- [x] Grep `src/web/` for `dangerouslySetInnerHTML` — should be zero matches. *(0 matches.)*
- [x] Audit every Claude-supplied string (component label/description, flow name, step action, step description) and confirm it flows through React's default text-escaping; no `innerHTML`, no `eval`, no unsafe URL construction. *(All strings rendered via JSX text interpolation; no risky sinks found.)*
- [x] If any string ends up in an `href` or `src`, ensure it cannot be `javascript:` or `data:`. *(All `to` props are `Link`/`NavLink` with `encodeURIComponent`'d ids — no Claude-supplied URL construction.)*
- [x] Unit test `jsonForScript()` against malicious strings (`</script>`, `</style>`, unicode escapes, lone `<`) and verify the produced HTML parses with no script-tag breakout. *(See `tests/cli/export.test.ts`.)*

## 9. SIGINT (Ctrl-C) handling

**Gap:** when a user hits Ctrl-C mid-analysis, the behaviour of in-flight `claude` subprocesses and the partial response cache is undefined.

- [x] Install a `SIGINT` handler in the orchestrator that:
  - propagates termination to all in-flight `execa` `claude` children; *(`terminateInflightClaude()` in `src/ai/claude.ts`.)*
  - persists already-completed cache entries before exit; *(`AiCache.set()` writes synchronously after each call, so completed entries are durable; nothing extra to flush.)*
  - closes the Fastify server cleanly. *(`await server?.close()` in the SIGINT branch of `analyze.ts`.)*
- [x] Confirm `execa` is invoked with `cleanup: true` (its default) so children die with the parent. *(Passed explicitly in `callClaude`.)*
- [x] Manual test: run `viszi <big-repo>`, Ctrl-C after a few seconds, verify no orphan `claude` processes (`pgrep claude`) and that re-running picks up from the partial cache instead of starting over. *(Verified against a synthetic ~8-file TS project at `/tmp/viszi-sigint-test`: SIGINT during an in-flight L2 call left 0 orphan `claude -p` processes; each subsequent run hit the L1 cache (unchanged mtime) and topped up missing L2 entries; a final fully-cached run completed in 294 ms with `estimatedCostUsd: undefined` and 0 claude spawns. The test surfaced two unrelated viszi bugs that had to be fixed first — see ADR-010 in `docs/02_Architecture/006_Decisions.md`.)*

## 11. Contributor surface

**Gap:** no `CONTRIBUTING.md`, no issue / PR templates, no `.nvmrc`.

- [x] `CONTRIBUTING.md` covering: clone, `npm install`, `npm run build`, `npm test`, `npm run typecheck`, `npm run lint`; the directory layout; how to run viszi against a fixture repo; how to add a new parser behind the `LanguageParser` interface.
- [x] `.github/ISSUE_TEMPLATE/bug_report.yml` and `feature_request.yml`.
- [x] `.github/PULL_REQUEST_TEMPLATE.md`.
- [x] `.nvmrc` pinning Node 20.
- [ ] Optional: `CODE_OF_CONDUCT.md` (Contributor Covenant boilerplate).

## 12. Project `CLAUDE.md`

**Gap:** the repo has no `CLAUDE.md`, so future Claude sessions don't inherit the conventions the maintainer set globally or project-locally.

- [x] Add `/CLAUDE.md` at the repo root with:
  - "Use jujutsu" (matches the user's global preference).
  - "When changing architecture or adding features, update `docs/02_Architecture/` and consider adding an ADR to `006_Decisions.md`."
  - Source-of-truth pointers: `docs/01_Specs/` for product, `docs/02_Architecture/` for design.
  - Key invariants: regex parsers live behind the `LanguageParser` interface; `SCHEMA_VERSION` in `src/ai/schemas.ts` must bump whenever a prompt or schema changes; viszi never imports the Anthropic SDK — always shells out via `src/ai/claude.ts`.
  - How to iterate locally with `--dry-run` (no AI calls).
  - How to (re)build the live demo for item 2.

## 13. `viszi init`

**Gap:** users who want to tune the analysis (exclude paths, override modules, cap budget) have to author `.viszi.json` from scratch.

- [x] Add a `viszi init [path]` command that:
  - refuses to overwrite an existing `.viszi.json` unless `--force`;
  - emits a commented file showing every supported field with its default;
  - optionally drops a `.viszi-ignore` template (via `--with-ignore`).
- [x] Document in `docs/01_Specs/002_CLI_Spec.md` and `docs/01_Specs/004_Config_Spec.md`.
