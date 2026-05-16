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

- [ ] Switch the ELK layout direction for `kind: 'flow'` diagrams from `DOWN` to `RIGHT` in `src/web/layout/elk.ts`.
- [ ] Update `FlowStepNode` handles in `src/web/components/nodes/FlowStepNode.tsx` from `Position.Top` / `Position.Bottom` to `Position.Left` / `Position.Right` so React Flow draws horizontal edges.
- [ ] Verify long step labels still fit — may need to bump node width or wrap text.
- [ ] Move the drill-down chevron (`drill in →` / new badge from item 7) from the bottom of each step card to the right edge so it stays at the "exit" of the step under horizontal flow.

## 2. Use more colors where they earn their keep

**Gap:** `styleForKind()` (`src/web/theme.ts`) maps the 13 `ComponentKind`s to **only 8 palette colours**, and the collisions hit exactly the kinds the reference codebase actually uses. Confirmed collisions:

- `service` + `module` → both blue (264 of 508 nodes; 52% of the canvas is one colour)
- `library` + `config` + `external` + `unknown` → all slate (77 nodes are slate, including two adjacent components that should look different)
- `queue` + `job` → both amber
- `controller` cyan and `cache` rose are unused entirely in this run — wasted budget

- [ ] Audit `theme.ts` palette: list each kind and its current accent/background/border (table in this file when done).
- [ ] Give every `ComponentKind` a unique colour. 13 kinds is small enough to hand-pick.
- [ ] Use a colour-blind-safe palette (Wong / Okabe-Ito) so the diagrams stay legible.
- [ ] Add a small legend in the topbar (kind → swatch → name) so users can decode without hovering.

## 3. Real progress bar during generation

**Gap:** the existing `ProgressBanner` shows the latest event (`✦ Claude components L2 src/auth`) and a `N diagrams · M AI calls` counter. With 26+ AI calls at level 2, users don't know how far in they are or how much longer it'll take.

- [ ] After the level-1 root system call completes, the orchestrator knows the level-1 component count and the depth target — derive an upper bound on total AI calls (system: `1 + N + N·M + …`; flows: capped by the 3-steps-per-flow rule).
- [ ] Publish a `progress.total` field on the bus's `ProgressEvent`s; have `ProgressBanner` render a real `[done / total]` bar.
- [ ] Show rolling average call duration + an ETA (`~Xs remaining`). Use a 5-call moving window so a slow call doesn't blow up the estimate.
- [ ] Surface the cache-hit/miss split (`12 cached · 14 fresh`) so users see when subsequent runs go fast.
- [ ] **Surface running cost.** Each `callClaude` result already carries `total_cost_usd`; sum it on the bus as `costSoFar`. Render as `$3.42 spent · ~$5 to go` next to the call counter. The $9 cold run was a surprise — a live cost meter would have let the user bail earlier. Pairs naturally with item 14 (pre-flight cost preview).
- [ ] Extend `BusState` / `BusMessage` (`src/server/eventBus.ts`) to include `aiCallCount`, `aiCallTotal`, `costSoFar`, `cacheHits`, `cacheMisses`. Today the front-end has to recompute these from the diagram stream.

## 4. Confirm/extend AI-call parallelism

**Gap:** the user perceived a 26-call level-2 run as serial. In fact `analyzeSystemTier` and `analyzeFlowsTier` *do* batch siblings with `Promise.all(...batch)` bounded by `--concurrency` (default `4`). Two possible improvements:

- [ ] Document the existing parallelism in `--help` so users discover `--concurrency 8` (or higher) without reading source.
- [ ] Make the default concurrency adaptive — e.g. `Math.min(8, os.cpus().length)`. The current default of 4 is conservative for a network-bound workload.
- [ ] **Cross-tier parallelism** (concrete win): today `analyzeFlowsTier` waits for *all* system tiers to finish (`runAnalysis` does `await analyzeSystemTier(...)` before even checking `flowsEnabled`). Once the level-1 root system diagram is ready, the level-1 flows call only depends on *that one diagram* — kick it off in parallel with the level-2 system fanout. On a 3-L2-system / 7-L1-flow shape at `concurrency=4`, this overlaps two big batches and probably halves wall time.
- [ ] Investigate batching multiple level-N system calls into one Claude prompt where the scopes are tiny (e.g. components with ≤ 3 files) — would halve cold-start cost on small projects.

## 5. Sidebar redesign — expand/collapse tree

**Gap:** the sidebar (`src/web/components/Sidebar.tsx`) currently lists *every* diagram in three flat sections (System / Flows / All Diagrams). On the reference run that's 89 entries in the "All Diagrams" section alone, grouped only by level number — overwhelming and uninformative.

- [ ] Build the hierarchy at write-time: `index.json` already has `parentId` on each diagram; derive a `children: string[]` map.
- [ ] Render the sidebar as a tree: only the level-1 root system + level-1 flows are visible initially.
- [ ] Each item with children gets a `▸` / `▾` chevron; clicking expands one level. Clicking the label itself navigates.
- [ ] Persist expand/collapse state per-diagram-id in `localStorage` so refresh doesn't collapse everything.
- [ ] Keep an "expand all" / "collapse all" affordance in the section header.
- [ ] **Group flows by trigger.** The index already has `flows[i].trigger` (`http` / `cli` / `cron` / `event` / `init` / `other`). Split the Flows section into subgroups so the reference run's 4 cli + 2 http + 1 init flows aren't one undifferentiated wall.

## 6. Visible back button

**Gap:** browser back works because routes are `/d/<id>`, but there's no visible affordance — users don't realise the breadcrumbs are clickable and end up trapped at depth. Bonus: keyboard `Esc` to pop up one level would feel natural.

- [ ] Add a back button to the topbar (`src/web/components/Topbar.tsx`) that calls `navigate(-1)` when there's a history entry, or navigates to `parentId` from the index otherwise (handles direct deep links).
- [ ] Show the back button only when the current diagram has a `parentId` (no point at the root).
- [ ] Bind `Esc` (when the command palette is closed) to the same handler.
- [ ] Make the breadcrumb segments more obviously clickable — underline on hover, pointer cursor, slightly brighter on the link colour.

## 7. Drill-down affordance on clickable components

**Gap:** components with a child diagram *are* clickable today (`ComponentNode` has `onClick` wired to `onDrill(subDiagramId)` and shows `drill in →` in the bottom-right). But the user's first impression was that nothing was clickable. Either a discoverability issue or the click handler isn't firing in some cases. **Likely interacting with item 8** — once L2 components stopped getting `subDiagramId` populated, the visible "drill in →" hint also disappeared from those nodes, which is consistent with "nothing was clickable" at depth.

- [ ] Verify the click handler actually navigates — manually click through every level on a `--levels 3` run and confirm the URL changes. If clicks are being eaten by React Flow's pan/drag handling, intercept on the inner card div and stop propagation.
- [ ] Increase the visual affordance: bolder border on hover, a corner-fold "drillable" badge, or a subtle pulse on hover.
- [ ] Change the cursor to `pointer` on the *whole* node card (not just the `drill in →` chip) when `subDiagramId` is set.
- [ ] Consider adding a small file-tree-style chevron in the corner of every drillable node.

## 8. **CRITICAL** — L2 → L3 drill-through is broken on real repos

**Gap:** at level 2 and below, components systematically end up with `files: []` and no `subDiagramId`, which silently blocks any further drill-down — even when the user passes `--levels 3+`.

**Root cause (confirmed by reading the cache + diagrams from a real run):** Claude returns `members: ["app/cli", "app/sub-pkg", …]` for the L2 `App` system, but the analyzer's `clusterIntoModules(graph, "src")` produces just one module with id `"app"` — because `app` isn't in `TOP_LEVEL_PASSTHROUGH` (`src/analyzer/modules.ts:24`), so all 100+ files collapse into the single first-segment bucket. `buildSystemDiagram` then does `moduleById.get("app/cli")` → `undefined` → empty `memberFiles` → no `subDiagramId`. Claude was working from a single coarse module and *invented* finer-grained ids that look right but don't exist in the analyzer's output.

- [ ] **Quick mitigation**: when `moduleById.get(mid)` misses, prefix-match (`mid + '/'`) against any module id and fall back to that module's files. Handles the common case where Claude refines a coarse module into sub-paths.
- [ ] **Better fix**: extend `moduleIdFor()` so that when a single top-level dir contains many files, it walks one level deeper. Today the rule fires only for `TOP_LEVEL_PASSTHROUGH` parents; relax to "if my first-segment bucket has > N files, descend one more level".
- [ ] **Better still**: feed Claude the *actual* file paths inside each candidate module (a small tree) and require it to choose from those paths when building `members`. Validates the response at parse time.
- [ ] Add an integration test (under `tests/integration/`) that builds a fixture mirroring this shape (single top-level package, ~10 sub-packages), runs `--levels 3 --dry-run`, and asserts every L2 component has `files.length > 0` and a `subDiagramId`. (The dry-run mock currently masks this bug — `mockComponents` uses 1:1 modules.)

## 9. Stop duplicating per-component file lists in every flow-step node

**Gap:** in flow diagrams, each step's `nodes[i].files` is set to the **entire** `files` list of the parent component. In the reference run, the dominant flow has 8 steps, 7 of which reference the same `componentId` — so the 100-file list is inlined 7 times in one diagram. Aggregate: **9608 file references stored for ~120 unique files** (80× duplication). Also breaks "click a step to jump to the code that does this step" — the file list isn't scoped to the step, it's the whole component.

- [ ] In `buildFlowDiagram` (`src/ai/orchestrator.ts`), stop copying `comp?.files ?? []` into every step's `nodes[i].files`. Store an empty array; let the frontend look up the component's files via `componentId` when it needs them.
- [ ] Have the frontend resolve `step.componentId` against the parent system diagram (already linked via `parentId`) when rendering a step's metadata.
- [ ] Update the schema in `src/ai/schemas.ts` if needed; bump `SCHEMA_VERSION`.
- [ ] **Optional, harder**: ask Claude to attribute a smaller list of step-relevant files (subset of the component) so step → file navigation becomes precise. Would need a prompt + schema change.

## 10. Filter out generic, "this step does what the component does"-style step labels

**Gap:** several flow steps from real runs are just `"Initialize X storage"`, `"Run main pipeline stages"` — they describe the component, not a discrete step in the flow. The flow becomes a re-labelling of the component diagram rather than an actual sequence-of-events view.

- [ ] Tighten the flow prompt (`src/ai/prompts/flows.ts`) to demand verb-led, single-responsibility actions ("validates X", "writes Y to Z") rather than component-shaped phrases.
- [ ] Reject (or merge) consecutive steps that share `componentId` *and* whose actions are too similar — likely Claude padding step count.
- [ ] Cap step count at the AI level: `steps` schema currently allows up to 20; consider dropping to 12 to force terser flows.

## 11. L1 is uninformative for single-package repos (`--root-scope`)

**Gap:** the reference repo's L1 has 3 components, one of which (`app-application`) contains 80% of the codebase. The "real" architecture lives at L2 inside that one giant box. Every repo shaped like `src/<one-package>/...` has the same problem.

The cheapest, most composable fix is a new flag that lets the user push the analysis start point one directory deeper.

- [ ] Add `--root-scope <relpath>` to the CLI. Example: `viszi . --root-scope src/app --levels 2` treats `src/app/` as the root. The L1 diagram would then have ~10 components (one per `src/app/<subpkg>/`) instead of 1.
- [ ] Implement by passing the scope to `traverse` (existing `opts.scope`) and threading it through `runAnalysis` so paths in the diagram are reported relative to the new root.
- [ ] **Heuristic auto-suggest (optional)**: at the end of an L1 run, if one component has ≥75% of the LOC, print `Hint: this repo has one dominant component. Re-run with --root-scope src/<X> for a more useful level 1.`
- [ ] Document in `docs/01_Specs/002_CLI_Spec.md`.

## 12. Don't drill into flow steps that have no underlying sub-structure

**Gap:** `analyzeFlowsTier` drills into the first 3 steps of every flow regardless of whether the step's component has a sub-system. On the reference run that produces 78 sub-flow diagrams, many of which are just "the parent flow re-described at the same granularity" because their component had no L2/L3 to refine against. 78 of the 89 total diagrams are flow noise.

- [ ] Before drilling a flow step, check whether `components.find(c => c.id === step.componentId)?.subDiagramId` is set. If not, the step has nothing meaningful to refine — skip it.
- [ ] If a component *does* have a sub-system, fetch that sub-system from the writer and pass its sub-components in as the recursion target (today the code already does this via `subSystem.nodes`, but it falls back to a hollow list when missing).
- [ ] Expected impact on the reference run: ~30% fewer diagrams, ~30% fewer flow AI calls, proportionally faster + cheaper.

## 13. Detect and collapse mono-component flows

**Gap:** in the reference run, the dominant flow has 8 steps; 7 of them reference the same `componentId`. The flow is functionally a list of method calls on one box rather than a multi-component interaction story. Several other flows in that run have the same shape.

- [ ] After a flow is generated, compute `dominantShare = max(stepsPerComponent) / steps.length`. If `dominantShare >= 0.8`:
  - [ ] **(simplest)** Tag the flow with `meta.monoComponent = true`; UI grays it out in the sidebar and adds a "mostly internal to X" subtitle.
  - [ ] **(better)** Re-issue the flow request against the L2 sub-system of the dominant component, so the new flow's steps reference the *inner* components instead.
  - [ ] **(strictest)** Drop the flow entirely from the index. It's not architectural signal.
- [ ] Make the threshold configurable (`flows.monoComponentThreshold` in `viszi.config.json`).

## 14. Pre-flight cost preview

**Gap:** users discover real cost only after the run. The reference repo's $9 came as a surprise; a competent estimate before the first `claude` call would let users abort or tune `--levels`.

- [ ] After the deterministic scan + module clustering (no AI yet), compute an upper bound on AI call count given `--levels`, the L1 component count guess (from cluster count), and the flow-drill cap.
- [ ] Multiply by a per-call cost prior (~$0.30/call cold, drops fast with prompt cache).
- [ ] Print before the first call: `Plan: ~26 AI calls, estimated ≤ $7.80 (≤ $0.50/call cap if set). Continue? [y/N]` (skip the prompt under `--yes` or `--no-confirm`).
- [ ] Once the L1 root system completes, *refine* the estimate using the real L1 component count and broadcast it on the bus so the progress bar (item 3) gets accurate totals.

## 15. File → diagram navigation

**Gap:** a user reading a file in their editor has no way to ask viszi "where does this show up?" Both the search index (`search.json`) and every system diagram know which files belong to which component, so the data is there — but the UI doesn't expose it.

- [ ] Extend the Cmd-K command palette (`src/web/components/CommandPalette.tsx`) with a "files" mode: typing a file path (or fragment) lists every diagram that contains that file, ranked by how prominent the file is in the diagram (e.g. by component LOC share).
- [ ] On any node card that has files, add a small "(N files)" link that opens a side-panel listing them; clicking a file goes back into the palette in "this file appears in:" mode.
- [ ] Doable entirely client-side from existing data — no new server calls, no AI.

## 16. Search index is fat — intern repeated strings

**Gap:** `search.json` is 493 KB for ~600 entries because every entry copies its parent diagram's title + description verbatim. The fields are massively repeated.

- [ ] Reshape `search.json` to `{ diagrams: { id → { title, description } }, entries: [{ label, diagramId, anchor?, kind, componentKind?, description? }] }`. Move per-diagram constants out of `entries`.
- [ ] Apply the same shape on the client search-index loader.
- [ ] Expected: 5–10× smaller `search.json` → matters proportionally for the inlined static-HTML export.

## 17. Per-diagram regenerate

**Gap:** to iterate on the prompt for one diagram, users have to `viszi clear` and re-run *everything*. There's no way to invalidate one cache key.

- [ ] Add `viszi regen <diagram-id>` CLI subcommand: invalidate the matching cache key + re-run *just* that one AI call + rewrite that diagram's file + republish on the bus (so the open UI updates live).
- [ ] In the UI, add a "regenerate this diagram" button in the top-right of every diagram view (gated to non-static mode).
- [ ] Crucial for prompt-tuning work on items 10, 13.

## 18. Per-diagram filter / hide nodes

**Gap:** on a 12-node L2 diagram, users often want to focus on 3. No way to hide the others.

- [ ] Multi-select hide (Shift-click? checkbox in a context menu?) on `ComponentNode`.
- [ ] Persist hidden ids to the URL hash (`?hide=cli,test-suite`) so the view is sharable.
- [ ] "Reset filter" button in the topbar.
- [ ] Stateless — no backend changes.

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
