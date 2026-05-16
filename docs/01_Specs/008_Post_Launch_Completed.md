# 008 — Post-Launch TODO: Completed Items Review

Snapshot of every ticked checkbox in `007_Post_Launch_TODO.md` as of 2026-05-16. Grouped by TODO item. Each entry quotes the original gap so you can see what was solved, then lists what landed. Items where every box is ticked are marked **(fully done)**; items with a mix show the open sub-bullets in *italic deferred* form for context.

---

## 1. Flow diagrams should flow horizontally

**Gap:** flow diagrams render top-to-bottom; users expect left-to-right.

- Switched ELK layout direction for `kind: 'flow'` (and system diagrams for consistency) from `DOWN` to `RIGHT` in `src/web/components/DiagramCanvas.tsx`.
- `FlowStepNode` handles flipped from `Position.Top` / `Position.Bottom` to `Position.Left` / `Position.Right` so React Flow draws horizontal edges.
- Verified long-label wrap: `.viszi-node.flow-step` max-width 240→260px; `.viszi-node .node-label` got `overflow-wrap: anywhere; word-break: break-word; line-height: 1.3`; flow-step header pinned with `align-items: flex-start` so the order chip sits on the first line of multi-line labels.

*Last bullet (move drill chevron to the right edge) was handled inline by item 7.*

---

## 2. Use more colors where they earn their keep **(fully done)**

**Gap:** `styleForKind()` mapped 13 `ComponentKind`s onto 8 palette colours → 52% of nodes rendered the same blue. `controller` cyan and `cache` rose were unused.

- Audited `theme.ts` and rewrote it: every kind now has its own accent/background/border entry (no shared `COLORS` map). Previous collisions (service+module blue; library/config/external/unknown slate; queue+job amber) eliminated.
- 13 unique hues across blue/cyan/emerald/amber/red/violet/slate/pink/teal/stone/orange/indigo/zinc.
- Hue + lightness chosen so deuteranope/protanope viewers can still distinguish adjacent kinds (Okabe-Ito principle).
- Added a `Legend` popover in the topbar (`src/web/components/Legend.tsx`) — swatch + icon + name for every kind. Click-outside / Esc to close.

---

## 3. Real progress bar during generation **(fully done)**

**Gap:** `ProgressBanner` showed the latest event + `N diagrams · M AI calls`. With 26+ calls users had no sense of progress, ETA, or running cost.

- `estimateAiCalls` in `src/ai/orchestrator.ts` derives an upper bound on total AI calls after the L1 root completes (system: `1 + N + N·M + …`; flows: capped by the 3-steps-per-flow rule); estimate is refined once the real L1 component count is known.
- New `plan` ProgressEvent; `aiCallIndex` / `aiCallTotal` threaded into every `ai` event; ProgressBanner renders `[done / total]`.
- Rolling 5-call moving window for average call duration + an `~Xs remaining` ETA on the CLI spinner.
- Cache-hit/miss split surfaced in BusState and rendered as `12 cached · 14 fresh`.
- Running cost: `callClaude.costUsd` summed into `writer.costUsd`; every `ai` event carries `cumulativeCostUsd`; BusState exposes `costSoFar`; banner shows `$X spent · ~$Y total`.
- `BusState` (`src/server/eventBus.ts`) extended with `aiCallTotal`, `costSoFar`, `cacheHits`, `cacheMisses` alongside the existing `aiCallCount` / `estimatedCostUsd`.

---

## 4. Confirm/extend AI-call parallelism

**Gap:** users perceived a 26-call run as serial. `--concurrency` default was a fixed `4`.

- `--concurrency` help text now explicitly notes the network-bound nature, the adaptive default formula, and the cross-tier 2× peak; CLI spec table updated; **ADR-012** added.
- Adaptive default in `src/cli/index.ts:defaultConcurrency` — `Math.min(8, Math.max(4, os.cpus().length))`. Floor at 4 keeps small CI runners parallel; cap at 8 stops rate-limit pressure.
- **Cross-tier parallelism** landed: `analyzeSystemTier` gained an `onSystemAdded(diagram)` hook; `runAnalysis` uses it on the L1 root to start `analyzeFlowsTier` as a separate promise, then awaits both. See ADR-012.

*Last bullet (batching multiple tiny level-N calls into one prompt) explicitly deferred — out of scope.*

---

## 5. Sidebar redesign — expand/collapse tree **(fully done)**

**Gap:** sidebar listed all 89 diagrams in three flat sections.

- Hierarchy derived client-side via `buildChildrenMap()` from each entry's existing `parentId` — no schema change.
- Tree rendering: only the root system + each top-level flow expanded on first visit; everything else collapsed.
- `▸` / `▾` chevron toggles; label stays a `NavLink` so clicking the label navigates.
- Expand/collapse state persisted to `localStorage` under `viszi.sidebar.expanded.v1` (JSON array of ids).
- "Expand all" / "collapse all" buttons (`+` / `−`) in the System section head.
- Flows grouped by trigger in `TRIGGER_ORDER` (`http` / `cli` / `cron` / `event` / `init` / `other`); empty groups not rendered.

---

## 6. Visible back button **(fully done)**

**Gap:** browser back worked but had no visible affordance; users got stuck at depth.

- Back button in `src/web/components/Topbar.tsx`: `navigate(-1)` when there's a history entry, falls back to `parentId` from the index for direct deep links.
- Disabled when `currentId === index.rootSystemId`; hidden when no `parentId`.
- `Esc` bound to the same handler, but skipped when an input/textarea/contentEditable is focused or the `[data-cmdk-open="true"]` palette is mounted.
- Breadcrumb segments more obviously clickable — accent colour + underline on hover.

---

## 7. Drill-down affordance on clickable components **(fully done)**

**Gap:** components with a child diagram were clickable but the affordance was invisible.

- Verified the click handler navigates; added explicit `e.stopPropagation()` on `ComponentNode` and `FlowStepNode` so React Flow's pane handlers can't swallow clicks.
- Hover state: 2px accent-coloured border (`var(--node-accent)`) and a stronger glow.
- `cursor: pointer` already on `.viszi-node.clickable`.
- Added a small `↗` corner badge (`.drill-corner`) on every drillable node — fades up + nudges out on hover.

---

## 8. **CRITICAL** — L2 → L3 drill-through broken on real repos

**Gap:** at level 2+, components ended up with `files: []` and no `subDiagramId`. Root cause: `clusterIntoModules` collapsed everything under `src/app/` into one bucket because `app` wasn't in `TOP_LEVEL_PASSTHROUGH`; Claude then "refined" into `app/cli`, `app/sub-pkg` ids that the analyzer didn't know about.

- **Quick mitigation**: `resolveMemberFiles` in `src/ai/orchestrator.ts` — when `moduleById.get(mid)` misses, prefix-match (`mid + '/'`) against any module id and fall back to that module's files. Tests in `tests/ai/resolve-member-files.test.ts`.
- **Better fix**: `clusterIntoModules` now walks one level deeper when a single top-level dir contains many files (adaptive depth; threshold `FILES_PER_MODULE_LIMIT = 25`). Tests in `tests/analyzer/modules-adaptive.test.ts`.
- Unit tests cover both fixes (the dry-run mock uses 1:1 modules, so couldn't exercise the resolver mismatch directly — direct unit tests instead).

*Last bullet (feed Claude the actual file tree and validate `members` at parse time) is the remaining open item.*

---

## 9. Stop duplicating per-component file lists in every flow-step node

**Gap:** each step's `nodes[i].files` carried the **entire** parent-component file list. 8-step mono flows inlined a 100-file list 7 times. **9608 file references for ~120 unique files** (80× duplication).

- `buildFlowDiagram` no longer copies `comp?.files ?? []` into every step; stores an empty array. Frontend looks up the component's files via `componentId` when needed.
- `FlowStepNode` never read `files` (resolves via `meta.componentId` / `meta.componentLabel`), so no UI change needed.
- Schema unchanged — writer-side dedupe, no `SCHEMA_VERSION` bump.

*Last bullet (Claude attributes a step-relevant subset of files; prompt + schema change) is the remaining open item.*

---

## 10. Filter out generic "this step does what the component does"-style step labels **(fully done)**

**Gap:** flow steps like `"Initialize X storage"` / `"Run main pipeline stages"` — describing the component, not a discrete step.

- Tightened `src/ai/prompts/flows.ts`: explicit "Step-quality rules" section with GOOD / BAD example labels, banned padding, demanded consecutive same-componentId steps be genuinely distinct. Step ranges reduced 4–12 → 3–10 (L1) and 3–10 → 3–8 (L2+).
- Defensive `mergeConsecutiveSimilarSteps` in `src/ai/orchestrator.ts`: merges consecutive same-componentId steps whose actions match by token-set Jaccard ≥ 0.7 OR strict subset. Runs inside `buildFlowDiagram` before assembling step ids, so stale pre-prompt-tightening cache entries also get cleaned up on read. Tests in `tests/ai/merge-similar-steps.test.ts`.
- `FlowsSchema.steps.maxItems` 20 → 12; `SCHEMA_VERSION` bumped 2 → 3 so cached pre-tightening responses are re-fetched.

---

## 11. L1 is uninformative for single-package repos (`--root-scope`) **(fully done)**

**Gap:** repos shaped like `src/<one-package>/...` collapse 80% of code into one L1 box; the "real" architecture lives one level deeper.

- New `--root-scope <relpath>` CLI flag. `viszi . --root-scope src/app --levels 2` treats `src/app/` as the root.
- Implementation passes the scope to `traverse` (existing `opts.scope`) and threads it through `runAnalysis` so paths in the diagram are reported relative to the new root.
- Heuristic auto-suggest: at the end of an L1 run, if one component holds ≥75% of the LOC, prints `Hint: One L1 component (X) holds 80% of the LOC. For a more useful Level 1, re-run with --root-scope src/<X>.`
- Documented in `docs/01_Specs/002_CLI_Spec.md`.

---

## 12. Don't drill into flow steps that have no underlying sub-structure

**Gap:** `analyzeFlowsTier` drilled into the first 3 steps regardless of whether the step's component had a sub-system. 78 of 89 total diagrams on the reference run were flow noise.

- Before drilling a flow step, `analyzeFlowsTier` now checks `components.find(c => c.id === step.componentId)?.subDiagramId`; skips when there's nothing to refine.
- When the component *does* have a sub-system, the sub-system is fetched from the writer and its sub-components are passed in as the recursion target (previously fell back to a hollow list when missing).

*Last bullet (validate ~30% reduction on a real run) is the remaining open item — needs a real-repo run.*

---

## 13. Detect and collapse mono-component flows

**Gap:** dominant flow had 8 steps, 7 referencing the same `componentId` — a list of method calls on one box rather than a multi-component story.

- After a flow is generated, `dominantShare = max(stepsPerComponent) / steps.length` is computed. If `dominantShare >= 0.8`, the flow is tagged with `meta.monoComponent = { componentId, componentLabel, share }` (`computeMonoComponent` in `src/ai/orchestrator.ts`). UI dims the sidebar entry (`.tree-row-mono`) + appends a "·1" hint; the diagram header renders a "mostly internal to X" note. Index entries carry the flag so the sidebar dims without loading the diagram file. Tests in `tests/ai/mono-component.test.ts`.
- Threshold configurable as `flows.monoComponentThreshold` in `viszi.config.json` (default `MONO_COMPONENT_THRESHOLD_DEFAULT = 0.8`; set > 1 to disable). Documented in `004_Config_Spec.md` + emitted in `viszi init`.
- **ADR-013** captures the tag-vs-drop rationale.

*Two open follow-ups deferred pending real-repo validation:*
- *(better) re-issue the flow request against the L2 sub-system of the dominant component.*
- *(strictest) drop the flow entirely from the index.*

---

## 14. Pre-flight cost preview

**Gap:** users discovered real cost only after the run. The reference repo's $9 came as a surprise.

- `estimateAiCalls` computes an upper bound on AI call count from the deterministic scan + module clustering (no AI yet), given `--levels`, the cluster-count guess, and the flow-drill cap.
- Multiplied by a per-call cost prior (`COST_PER_CALL_PRIOR_USD = $0.30`).
- New `plan` ProgressEvent emitted before the first Claude call. CLI logs `Plan: ~26 AI calls, estimated ≤ $7.80 · per-call cap $0.50`.
- Estimate refined once the L1 root completes; a second `plan` event fires with `refined: true`.

*Last bullet (interactive `[y/N]` confirm with `--yes`/`--no-confirm` opt-out) is the remaining open item — informational print covers the surprise-cost concern for now.*

---

## 15. File → diagram navigation **(fully done)**

**Gap:** no way for a user reading a file to ask "where does this show up?"

- Cmd-K command palette gained a "files" mode: triggered by `f:` prefix or any `/` in the query. Lists every (file, diagram, component) location, ranked by path-boundary match strength + appearance count.
- Node-card "(N files)" side-panel: the chip on each `ComponentNode` is now a button that opens a `FilesPanel` (`src/web/components/FilesPanel.tsx`) in the top-right of the canvas — heading + count chip, file list, "Copy" button to clipboard, Esc to close. Flow-step nodes don't carry files (#9 dedupe) and navigate via drill-in.
- Implemented entirely client-side (`buildFileIndex` + `searchFiles` + `parseFileQuery` in `src/web/search.ts`) — no new server calls. Tests in `tests/web/file-index.test.ts`.

---

## 16. Search index is fat — intern repeated strings **(fully done)**

**Gap:** `search.json` was 493 KB for ~600 entries because every entry copied its parent diagram's title + description.

- Reshaped to `{ diagrams: { id → { title, kind, level } }, entries: [...] }` — per-entry `diagramTitle` / `diagramKind` / `diagramLevel` replaced by a single per-diagram record.
- Client hydrates via `hydrateSearch()` (`src/web/search.ts`) which joins `entries[]` against the `diagrams` map. Accepts the legacy flat-array shape for older caches.
- Tests in `tests/web/hydrate-search.test.ts` cover new shape + legacy fallback + missing-id graceful default.

---

## 17. Per-diagram regenerate **(fully done)**

**Gap:** iterating on the prompt for one diagram required `viszi clear` + full re-run.

- New `viszi regen <diagram-id> [path]` (`src/cli/commands/regen.ts` + registered in `src/cli/index.ts`). Reads the diagram's stamped `meta.regenCacheKey`, deletes the single `.viszi/cache/<file>.json`, re-runs the analyser; only one Claude call fires because every other cache entry stays warm.
- Diagrams carry `meta.regenCacheKey` at write time (`buildSystemDiagram` + `buildFlowDiagram`), backed by a new public `AiCache.filenameFor()` so the filename is computed in exactly one place.
- "Regenerate" button in the top-right of every diagram view (gated to non-static mode via `window.__VISZI_DATA__`); copies the matching `viszi regen <id>` command to clipboard (with a `window.prompt` fallback for non-secure contexts). In-process bus-driven live re-run captured as a follow-up — clipboard form covers the prompt-tuning use case.
- Documented in `docs/01_Specs/002_CLI_Spec.md`.

---

## 18. Per-diagram filter / hide nodes **(fully done)**

**Gap:** on a 12-node L2 diagram, users often want to focus on 3.

- Hide-on-click: every `ComponentNode` and `FlowStepNode` shows a `×` button in the top-left on hover. Clicking adds the node id to the hidden set.
- Persisted to the URL hash (`#hide=id1,id2`) via `URLSearchParams` so the view is share-able and survives reload. `DiagramCanvas` reads the set every render and re-filters nodes + edges.
- "N hidden · Reset" pill in the top-right when any node is hidden; Reset clears the `hide` hash param (preserves other hash params like `focus`).
- Stateless — no backend changes. Edges whose source or target is hidden are filtered client-side so the layout doesn't leave dangling arrows.

---

## Cross-cutting

- **ADR-012** added to `docs/02_Architecture/006_Decisions.md` — cross-tier parallelism via `onSystemAdded` hook + adaptive concurrency default.
- **ADR-013** added — mono-component flow tagging is a post-processing hint, not a filter (tag-vs-drop chose tag because reversible, lower risk, threshold tuning can wait for real-repo data).
- **`SCHEMA_VERSION` bumped 2 → 3** with the flow-prompt tightening so stale cache entries are re-fetched.
- **Test count**: 122 tests passing across the new unit suites — `mono-component`, `merge-similar-steps`, `resolve-member-files`, `modules-adaptive`, `file-index`, `hydrate-search`.

---

## What's still open

For completeness, the unticked items inside the 1–18 list are:
- **#1 last bullet** — handled inline by #7.
- **#4 last bullet** — batched level-N system calls; out-of-scope.
- **#8 last bullet** — feed Claude the actual file paths and validate `members` at parse time.
- **#9 last bullet** — Claude attributes step-relevant file subsets (prompt + schema change).
- **#12 last bullet** — validate ~30% reduction on a real run.
- **#13 (better) / (strictest)** — deferred pending real-repo signal.
- **#14 last bullet** — interactive `[y/N]` confirm.
- **#17 in-process live regenerate** — clipboard form covers it.

Bigger ideas A–G in the parent doc remain v0.3+ design conversations.
