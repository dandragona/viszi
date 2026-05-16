# 007 — Post-Launch TODO

UX + performance items surfaced by the first real-world run of viszi (a `--levels 2 --flows` analysis on a ~120-file Python codebase: 26 AI calls, 89 emitted diagrams, $9.05 cold-run cost). Distinct from `006_Public_Launch_Checklist.md`: those were "what's missing to ship at all", these are "what's rough now that we've used it".

Each item is a short **Gap** followed by a checklist of concrete actions. Order is roughly impact × ease.

## Reference data

Hard numbers from the run described above:

- **89 diagrams** (1 L1 system, 3 L2 systems, 7 L1 flows, 78 L2 sub-flows)
- **508 nodes** across all diagrams
- **9608 total `node.files[]` entries** — 80× duplication vs the ~120 unique source files (see item 9)
- **Kind distribution** (in priority order): service 213, ui 107, library 66, cli 56, module 51, external 11, job 4. Zero `database` / `queue` / `cache` / `controller` / `config` / `unknown` nodes. With current colour mapping, 264 nodes (52%) render blue because `service` and `module` share blue.
- **Largest single diagram file**: 60 KB (`flow.51b7d8e6a587.json`)
- **Total `.viszi/` size**: 1.8 MB (mostly `search.json` + repeated file lists)

---

## 1. Flow diagrams should flow horizontally

**Gap:** flow diagrams render top-to-bottom. For flows with 5–8 steps the canvas scrolls vertically and most steps fall below the fold; relationships read left-to-right in every other diagramming tool the user has seen.

- [x] Switch the ELK layout direction for `kind: 'flow'` diagrams from `DOWN` to `RIGHT` (and apply the same to system diagrams for consistency — `layoutWithElk(..., { direction: 'RIGHT' })` in `src/web/components/DiagramCanvas.tsx`).
- [x] Update `FlowStepNode` handles in `src/web/components/nodes/FlowStepNode.tsx` from `Position.Top` / `Position.Bottom` to `Position.Left` / `Position.Right` so React Flow draws horizontal edges.
- [x] Verified long step labels wrap cleanly: bumped `.viszi-node.flow-step` max-width 240→260px and added `overflow-wrap: anywhere; word-break: break-word; line-height: 1.3` to `.viszi-node .node-label`. The flow-step header now uses `align-items: flex-start` so the step-order chip pins to the first line of a multi-line label rather than floating in the vertical centre.
- [ ] Move the drill-down chevron (`drill in →` / new badge from item 7) from the bottom of each step card to the right edge so it stays at the "exit" of the step under horizontal flow. *(handled inline by item 7.)*

## 2. Use more colors where they earn their keep

**Gap:** `styleForKind()` (`src/web/theme.ts`) maps the 13 `ComponentKind`s to **only 8 palette colours**, and the collisions hit exactly the kinds the reference codebase actually uses. Confirmed collisions:

- `service` + `module` → both blue (264 of 508 nodes; 52% of the canvas is one colour)
- `library` + `config` + `external` + `unknown` → all slate (77 nodes are slate, including two adjacent components that should look different)
- `queue` + `job` → both amber
- `controller` cyan and `cache` rose are unused entirely in this run — wasted budget

- [x] Audited `theme.ts` and rewrote it: each kind now has its own accent/background/border entry (no shared `COLORS` map). Previous collisions (service+module blue; library/config/external/unknown slate; queue+job amber) are eliminated.
- [x] Every `ComponentKind` now has a unique colour — 13 hues across blue/cyan/emerald/amber/red/violet/slate/pink/teal/stone/orange/indigo/zinc.
- [x] Hues + lightness chosen so deuteranope/protanope viewers can still distinguish adjacent kinds (well-separated hue *and* lightness variance per the Okabe-Ito principle).
- [x] Added a `Legend` popover in the topbar (`src/web/components/Legend.tsx`) — swatch + icon + name for every kind. Click outside or Esc to close.

## 3. Real progress bar during generation

**Gap:** the existing `ProgressBanner` shows the latest event (`✦ Claude components L2 src/auth`) and a `N diagrams · M AI calls` counter. With 26+ AI calls at level 2, users don't know how far in they are or how much longer it'll take.

- [x] After the level-1 root system call completes, the orchestrator knows the level-1 component count and the depth target — derive an upper bound on total AI calls (system: `1 + N + N·M + …`; flows: capped by the 3-steps-per-flow rule). (`estimateAiCalls` in `src/ai/orchestrator.ts`; refined after L1 completes.)
- [x] Publish a `plan` ProgressEvent + thread `aiCallIndex`/`aiCallTotal` into every `ai` event; ProgressBanner renders `[done / total]`.
- [x] Show rolling average call duration + an ETA (`~Xs remaining`) using a 5-call moving window (CLI; sticks to live spinner text).
- [x] Surface the cache-hit/miss split (`12 cached · 14 fresh`) — wired in BusState + rendered by ProgressBanner.
- [x] **Surface running cost.** `callClaude.costUsd` is summed into `writer.costUsd`; each `ai` event reports `cumulativeCostUsd`; BusState exposes `costSoFar`; banner renders `$X spent · ~$Y total`.
- [x] Extended `BusState` (`src/server/eventBus.ts`) with `aiCallTotal`, `costSoFar`, `cacheHits`, `cacheMisses` (alongside existing `aiCallCount`, `estimatedCostUsd`).

## 4. Confirm/extend AI-call parallelism

**Gap:** the user perceived a 26-call level-2 run as serial. In fact `analyzeSystemTier` and `analyzeFlowsTier` *do* batch siblings with `Promise.all(...batch)` bounded by `--concurrency` (default `4`). Two possible improvements:

- [x] Help text for `--concurrency` now explicitly notes the network-bound nature, the adaptive default formula, and the cross-tier 2× peak; CLI spec table updated; ADR-012 added to the decision log.
- [x] Default concurrency is now adaptive — `Math.min(8, Math.max(4, os.cpus().length))` in `src/cli/index.ts:defaultConcurrency`. Floor at 4 keeps small CI runners parallel; cap at 8 stops rate-limit pressure.
- [x] **Cross-tier parallelism** landed. `analyzeSystemTier` gained an `onSystemAdded(diagram)` hook; `runAnalysis` uses it on the L1 root to start `analyzeFlowsTier` as a separate promise, then awaits it after the system fanout finishes. See ADR-012.
- [ ] Investigate batching multiple level-N system calls into one Claude prompt where the scopes are tiny — out-of-scope for this round; would need a new schema and a different cache strategy.

## 5. Sidebar redesign — expand/collapse tree

**Gap:** the sidebar (`src/web/components/Sidebar.tsx`) currently lists *every* diagram in three flat sections (System / Flows / All Diagrams). On the reference run that's 89 entries in the "All Diagrams" section alone, grouped only by level number — overwhelming and uninformative.

- [x] Derived the hierarchy client-side via a `buildChildrenMap()` from each entry's existing `parentId` — no schema change needed.
- [x] Sidebar now renders as a tree: only the root system + each top-level flow are expanded on first visit; everything else is collapsed.
- [x] Each item with children gets a `▸` / `▾` chevron; clicking it toggles. The label is a `NavLink` so clicking the label navigates.
- [x] Expand/collapse state persisted to `localStorage` under `viszi.sidebar.expanded.v1` (JSON array of ids).
- [x] Added "expand all" / "collapse all" buttons (`+` / `−`) in the System section head.
- [x] **Flows grouped by trigger.** Split into subgroups in `TRIGGER_ORDER` (`http` / `cli` / `cron` / `event` / `init` / `other`) — empty groups are not rendered.

## 6. Visible back button

**Gap:** browser back works because routes are `/d/<id>`, but there's no visible affordance — users don't realise the breadcrumbs are clickable and end up trapped at depth. Bonus: keyboard `Esc` to pop up one level would feel natural.

- [x] Add a back button to the topbar (`src/web/components/Topbar.tsx`) that calls `navigate(-1)` when there's a history entry, or navigates to `parentId` from the index otherwise (handles direct deep links).
- [x] Show the back button only when the current diagram has a `parentId` (no point at the root) — `disabled` when `currentId === index.rootSystemId`.
- [x] Bind `Esc` (when the command palette is closed) to the same handler. (Skips when an input/textarea/contentEditable is focused or the `[data-cmdk-open="true"]` palette is mounted.)
- [x] Make the breadcrumb segments more obviously clickable — accent colour + underline on hover (`src/web/styles.css`).

## 7. Drill-down affordance on clickable components

**Gap:** components with a child diagram *are* clickable today (`ComponentNode` has `onClick` wired to `onDrill(subDiagramId)` and shows `drill in →` in the bottom-right). But the user's first impression was that nothing was clickable. Either a discoverability issue or the click handler isn't firing in some cases. **Likely interacting with item 8** — once L2 components stopped getting `subDiagramId` populated, the visible "drill in →" hint also disappeared from those nodes, which is consistent with "nothing was clickable" at depth.

- [x] Verified the click handler navigates — added explicit `e.stopPropagation()` on both `ComponentNode` and `FlowStepNode` so React Flow's pane handlers can never swallow the click.
- [x] Bolder border on hover: hover swaps to a 2px accent-coloured border (`var(--node-accent)`) and a stronger glow.
- [x] `cursor: pointer` already applied to the whole `.viszi-node.clickable` card.
- [x] Added a small `↗` corner badge (`.drill-corner` in `src/web/styles.css`) on every drillable node — fades up + nudges out on hover.

## 8. **CRITICAL** — L2 → L3 drill-through is broken on real repos

**Gap:** at level 2 and below, components systematically end up with `files: []` and no `subDiagramId`, which silently blocks any further drill-down — even when the user passes `--levels 3+`.

**Root cause (confirmed by reading the cache + diagrams from a real run):** Claude returns `members: ["app/cli", "app/sub-pkg", …]` for the L2 `App` system, but the analyzer's `clusterIntoModules(graph, "src")` produces just one module with id `"app"` — because `app` isn't in `TOP_LEVEL_PASSTHROUGH` (`src/analyzer/modules.ts:24`), so all 100+ files collapse into the single first-segment bucket. `buildSystemDiagram` then does `moduleById.get("app/cli")` → `undefined` → empty `memberFiles` → no `subDiagramId`. Claude was working from a single coarse module and *invented* finer-grained ids that look right but don't exist in the analyzer's output.

- [x] **Quick mitigation**: when `moduleById.get(mid)` misses, prefix-match (`mid + '/'`) against any module id and fall back to that module's files. Handles the common case where Claude refines a coarse module into sub-paths. (`resolveMemberFiles` in `src/ai/orchestrator.ts`; tests in `tests/ai/resolve-member-files.test.ts`.)
- [x] **Better fix**: extend `moduleIdFor()` so that when a single top-level dir contains many files, it walks one level deeper. (Adaptive depth in `clusterIntoModules`; tests in `tests/analyzer/modules-adaptive.test.ts`. Threshold = `FILES_PER_MODULE_LIMIT = 25`.)
- [ ] **Better still**: feed Claude the *actual* file paths inside each candidate module (a small tree) and require it to choose from those paths when building `members`. Validates the response at parse time.
- [x] Unit tests for both above (the dry-run mock uses 1:1 modules and so can't exercise the resolver mismatch directly; covered via direct unit tests on `resolveMemberFiles` and `clusterIntoModules`).

## 9. Stop duplicating per-component file lists in every flow-step node

**Gap:** in flow diagrams, each step's `nodes[i].files` is set to the **entire** `files` list of the parent component. In the reference run, the dominant flow has 8 steps, 7 of which reference the same `componentId` — so the 100-file list is inlined 7 times in one diagram. Aggregate: **9608 file references stored for ~120 unique files** (80× duplication). Also breaks "click a step to jump to the code that does this step" — the file list isn't scoped to the step, it's the whole component.

- [x] In `buildFlowDiagram` (`src/ai/orchestrator.ts`), stop copying `comp?.files ?? []` into every step's `nodes[i].files`. Store an empty array; let the frontend look up the component's files via `componentId` when it needs them.
- [x] Frontend already resolves `step.componentId` via `meta.componentId` / `meta.componentLabel` — `FlowStepNode` never read `files`, so no change needed.
- [x] Schema unchanged — this is a writer-side dedupe, not an AI-prompt change. No `SCHEMA_VERSION` bump required.
- [ ] **Optional, harder**: ask Claude to attribute a smaller list of step-relevant files (subset of the component) so step → file navigation becomes precise. Would need a prompt + schema change.

## 10. Filter out generic, "this step does what the component does"-style step labels

**Gap:** several flow steps from real runs are just `"Initialize X storage"`, `"Run main pipeline stages"` — they describe the component, not a discrete step in the flow. The flow becomes a re-labelling of the component diagram rather than an actual sequence-of-events view.

- [x] Tightened `src/ai/prompts/flows.ts`: added an explicit "Step-quality rules" section with GOOD / BAD example labels, banned padding (count must match real steps), and demanded that consecutive same-componentId steps be genuinely distinct. Reduced step ranges from "4-12" to "3-10" (L1) / "3-8" (L2+).
- [x] Defensive merge of consecutive same-componentId steps whose actions are too similar (token-set Jaccard ≥ 0.7 OR strict subset). Lives in `mergeConsecutiveSimilarSteps` (`src/ai/orchestrator.ts`) and runs inside `buildFlowDiagram` before assembling step ids, so cached pre-prompt-tightening responses also get cleaned up on read. Tests in `tests/ai/merge-similar-steps.test.ts`.
- [x] Step-count cap: `FlowsSchema.steps.maxItems` 20 → 12 (`src/ai/schemas.ts`). `SCHEMA_VERSION` bumped 2 → 3 so cached pre-tightening responses are re-fetched.

## 11. L1 is uninformative for single-package repos (`--root-scope`)

**Gap:** the reference repo's L1 has 3 components, one of which (`app-application`) contains 80% of the codebase. The "real" architecture lives at L2 inside that one giant box. Every repo shaped like `src/<one-package>/...` has the same problem.

The cheapest, most composable fix is a new flag that lets the user push the analysis start point one directory deeper.

- [x] Add `--root-scope <relpath>` to the CLI. Example: `viszi . --root-scope src/app --levels 2` treats `src/app/` as the root. The L1 diagram would then have ~10 components (one per `src/app/<subpkg>/`) instead of 1.
- [x] Implement by passing the scope to `traverse` (existing `opts.scope`) and threading it through `runAnalysis` so paths in the diagram are reported relative to the new root.
- [x] **Heuristic auto-suggest**: at the end of an L1 run, if one component has ≥75% of the LOC, print `Hint: One L1 component (X) holds 80% of the LOC. For a more useful Level 1, re-run with --root-scope src/<X>.`
- [x] Document in `docs/01_Specs/002_CLI_Spec.md`.

## 12. Don't drill into flow steps that have no underlying sub-structure

**Gap:** `analyzeFlowsTier` drills into the first 3 steps of every flow regardless of whether the step's component has a sub-system. On the reference run that produces 78 sub-flow diagrams, many of which are just "the parent flow re-described at the same granularity" because their component had no L2/L3 to refine against. 78 of the 89 total diagrams are flow noise.

- [x] Before drilling a flow step, check whether `components.find(c => c.id === step.componentId)?.subDiagramId` is set. If not, the step has nothing meaningful to refine — skip it. (Implemented in `analyzeFlowsTier`, `src/ai/orchestrator.ts`.)
- [x] If a component *does* have a sub-system, fetch that sub-system from the writer and pass its sub-components in as the recursion target (today the code already does this via `subSystem.nodes`, but it falls back to a hollow list when missing).
- [ ] Expected impact on the reference run: ~30% fewer diagrams, ~30% fewer flow AI calls, proportionally faster + cheaper. *(needs validation on a real run with these changes.)*

## 13. Detect and collapse mono-component flows

**Gap:** in the reference run, the dominant flow has 8 steps; 7 of them reference the same `componentId`. The flow is functionally a list of method calls on one box rather than a multi-component interaction story. Several other flows in that run have the same shape.

- [x] After a flow is generated, compute `dominantShare = max(stepsPerComponent) / steps.length`. If `dominantShare >= 0.8`:
  - [x] **(simplest)** Tag the flow with `meta.monoComponent = { componentId, componentLabel, share }` (`computeMonoComponent` in `src/ai/orchestrator.ts`); UI dims the sidebar entry (`.tree-row-mono`) + appends a "·1" hint, and the diagram header renders a "mostly internal to X" note. Index entries carry the flag so the sidebar dims without loading the diagram file. Tests in `tests/ai/mono-component.test.ts`.
  - [ ] **(better)** Re-issue the flow request against the L2 sub-system of the dominant component, so the new flow's steps reference the *inner* components instead. *(deferred — needs real-repo validation that the L2 sub-system is informative enough to re-prompt against.)*
  - [ ] **(strictest)** Drop the flow entirely from the index. *(deferred — too destructive without real-repo signal that the flow is actually noise.)*
- [x] Threshold is configurable: `flows.monoComponentThreshold` in `viszi.config.json` (default `MONO_COMPONENT_THRESHOLD_DEFAULT = 0.8`; set > 1 to disable). Documented in `004_Config_Spec.md` + emitted in `viszi init`.

## 14. Pre-flight cost preview

**Gap:** users discover real cost only after the run. The reference repo's $9 came as a surprise; a competent estimate before the first `claude` call would let users abort or tune `--levels`.

- [x] After the deterministic scan + module clustering (no AI yet), compute an upper bound on AI call count given `--levels`, the L1 component count guess (from cluster count), and the flow-drill cap. (`estimateAiCalls`.)
- [x] Multiply by a per-call cost prior (`COST_PER_CALL_PRIOR_USD = $0.30`).
- [x] Print the plan via a new `plan` ProgressEvent emitted before the first Claude call. The CLI logs `Plan: ~26 AI calls, estimated ≤ $7.80 · per-call cap $0.50`. (Interactive `[y/N]` prompt deferred — would gate `--yes`/`--no-confirm` flags; current behavior is informational only.)
- [x] Once the L1 root system completes, *refine* the estimate using the real L1 component count and emit a second `plan` event with `refined: true`.
- [ ] Interactive confirmation prompt with `--yes` opt-out (deferred — informational print covers the surprise-cost concern).

## 15. File → diagram navigation

**Gap:** a user reading a file in their editor has no way to ask viszi "where does this show up?" Both the search index (`search.json`) and every system diagram know which files belong to which component, so the data is there — but the UI doesn't expose it.

- [x] Extended the Cmd-K command palette with a "files" mode: triggered by `f:` prefix or any `/` in the query. Lists every (file, diagram, component) location, ranked by path-boundary match strength + appearance count.
- [x] Node-card "(N files)" side-panel: the chip on each `ComponentNode` is now a button that opens a `FilesPanel` (`src/web/components/FilesPanel.tsx`) in the top-right of the canvas — heading + count chip, full file list, "Copy" button to clipboard, Esc to close. Flow-step nodes don't carry files (#9 dedupe); they navigate via drill-in.
- [x] Implemented client-side (`buildFileIndex` + `searchFiles` + `parseFileQuery` in `src/web/search.ts`) — no new server calls. Tests in `tests/web/file-index.test.ts`.

## 16. Search index is fat — intern repeated strings

**Gap:** `search.json` is 493 KB for ~600 entries because every entry copies its parent diagram's title + description verbatim. The fields are massively repeated.

- [x] Reshaped `search.json` to `{ diagrams: { id → { title, kind, level } }, entries: [...] }` — per-entry `diagramTitle`/`diagramKind`/`diagramLevel` removed in favour of a single per-diagram record.
- [x] Client now hydrates via `hydrateSearch()` (`src/web/search.ts`) which joins `entries[]` against the `diagrams` map before handing the flat shape to the ranker. Accepts the legacy flat-array shape for older caches.
- [x] Tests in `tests/web/hydrate-search.test.ts` cover the new shape + legacy fallback + the missing-id graceful default.
- [x] Expected on-disk savings: every entry sheds 3 repeated fields; on a 600-entry / 89-diagram run that's hundreds of redundant title copies eliminated.

## 17. Per-diagram regenerate

**Gap:** to iterate on the prompt for one diagram, users have to `viszi clear` and re-run *everything*. There's no way to invalidate one cache key.

- [x] Added `viszi regen <diagram-id> [path]` (`src/cli/commands/regen.ts` + registered in `src/cli/index.ts`). Reads the diagram's stamped `meta.regenCacheKey`, deletes that single `.viszi/cache/<file>.json`, then re-runs the analyser. Because every other cache entry stays warm, only the one targeted Claude call actually fires.
- [x] Diagrams now carry `meta.regenCacheKey` at write time (`buildSystemDiagram` + per-flow `buildFlowDiagram`), backed by a new public `AiCache.filenameFor()` so the filename is computed in exactly one place.
- [x] Added a `Regenerate` button in the top-right of every diagram view (gated to non-static mode via `window.__VISZI_DATA__`). Clicking copies the matching `viszi regen <id>` command to the clipboard (with a `window.prompt` fallback for non-secure contexts). The in-process bus-driven live re-run is captured as a follow-up — the clipboard form covers the prompt-tuning use case without extra server surface.
- [x] Crucial for prompt-tuning work on items 10, 13. Documented in `docs/01_Specs/002_CLI_Spec.md`.

## 18. Per-diagram filter / hide nodes

**Gap:** on a 12-node L2 diagram, users often want to focus on 3. No way to hide the others.

- [x] Hide-on-click affordance: every `ComponentNode` and `FlowStepNode` shows a small `×` button in the top-left on hover. Clicking it adds the node id to the hidden set.
- [x] Persisted to the URL hash (`#hide=id1,id2`) via `URLSearchParams` so the view is share-able and survives reload. `DiagramCanvas` reads the set on every render and re-filters nodes + edges accordingly.
- [x] "N hidden · Reset" pill renders in the top-right of the canvas when any node is hidden; clicking Reset clears the `hide` hash param (preserves any other hash params like `focus`).
- [x] Stateless — no backend changes. Edges whose source or target is hidden are filtered out client-side so the layout doesn't leave dangling arrows.

---

## Bigger ideas (separate threads)

These don't fit the "small targeted fix" shape of items 1–18. Capture them here so we don't lose the thread; each is a v0.3+ design conversation.

### A. `viszi init --from-pyproject` / `--from-package-json`

Use authoritative workspace declarations (pyproject.toml `[tool.uv.workspace]`, package.json `workspaces`, Cargo workspaces, go.mod) as module boundaries instead of inferring from paths. Side-steps item 8 entirely for properly-packaged projects.

### B. `viszi watch`

File-watcher → incremental re-analysis. Cache makes one-file changes ~1 AI call. Open browser updates live as the user edits. Likely the most-used v0.3 feature for daily work.

### C. Markdown export

`viszi export --format md` produces an `ARCHITECTURE.md`-style document from the existing diagram data. Useful for repo docs, onboarding, and as context for other AI agents reading the repo.

### D. "Why this component?" debug view

Keystroke (e.g. `Cmd-Shift-D`) shows the raw Claude response from `cache/` that produced the current diagram — the prompt, the schema, the structured output. Invaluable for diagnosing the kind of bug item 8 surfaced.

### E. Implement the `modules` config override

`viszi.config.json` already accepts `"modules": { "auth": ["src/auth/**", ...] }` per the spec, but the orchestrator doesn't read it. Wire it through `clusterIntoModules` as a pre-clustering layer that wins over the heuristic.

### F. Multi-repo / org view

Scan a directory of repos; emit a meta-diagram of which repos import which. Different product surface, but the analyzer primitives are all there.

### G. Diagram diff across runs

Persist a prior run's `.viszi/` alongside the new one; show which components / flows changed (added / removed / renamed / re-edged). Powers a "what did this PR change architecturally?" view.

---

## How to use this list

When a maintainer picks up an item:
1. Open a PR titled `feat/fix(007 item N): <one-line summary>`.
2. Tick the boxes inside this file in the same PR.
3. If the work splits into smaller pieces, leave the unticked sub-boxes and add a short note about what landed.

Items don't need to be done in order. **Recommended v0.3 milestone**:

1. **#8** (drill-through bug) — functional regression; everything downstream depends on this working.
2. **#11** (`--root-scope`) — turns single-package repos from "L1 is one giant box" to "L1 is the actual architecture".
3. **#12** (don't drill non-drillable flow steps) — cuts ~30% of diagram + AI noise on single-package repos.
4. **#9** (file-list dedup) — 50× disk reduction; trivial.
5. **#3 + #14** combined (live cost meter + pre-flight estimate) — turns the cost surprise into a first-class part of the UX.

Cheap UX polish to bundle whenever: **#1** (horizontal flows), **#5** (sidebar tree + trigger groups), **#6** (back button), **#7** (drill affordance).

Wait until more real-repo data: **#10** (prompt tuning), **#13** (mono-component flow heuristics).
