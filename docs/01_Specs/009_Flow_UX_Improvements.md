# 009 — Flow UX Improvements

UX items surfaced by clicking through the second real-world reference run: viszi against `~/Projects/gimli` (`--levels 2 --flows`, 73 diagrams, 32 AI calls, 7 top-level flows + 11 sub-flows). Distinct from `007_Post_Launch_TODO.md`, which was the first-run discovery list; that one is mostly closed and its open items are not flow-shaped.

Each item is a short **Gap** followed by a checklist of concrete actions. Order is roughly impact × ease, with flow-rendering items first since the existing layout (single horizontal pipe of identical cards) leaves the most on the table.

## Reference data

From the gimli run:

- **73 diagrams** (1 L1 system, 9 L2 systems, 7 L1 flows, 56 L2 sub-flows).
- **Flow shapes:** every flow is 2–7 steps in a single sequential chain (no branching, no parallel fanout) — `meta.json: flowsEnabled: true`, no `meta.parallelSteps`. Several flows mark `monoComponent: { share: 1.0 }`, i.e. every step happens inside one component.
- **Step `files: []` is empty on every flow node** — the schema doesn't ask for it, so the FilesPanel only ever opens from system diagrams.
- **Step `description` is empty on every flow node** — the AI prompt doesn't fill the optional `description` field defined in `FlowsSchema`.

---

## 1. Vertical flow layout with component swim lanes

**Gap:** flows render as a single horizontal pipe of step cards (`{number} {verb}` + tiny component pill below). On a 1600px viewport with a ~250px sidebar that gives each card ≤180px of width, so long step labels truncate ("dispatches trade-pipeline run…") and the trigger banner floats top-left disconnected from the steps. Worse, the cards don't visually convey *who* runs each step — only *what* — so the natural question "which component does the LLM call live in?" can only be answered by reading each card.

- [x] Flow diagrams now go top-to-bottom. ELK is bypassed for `kind: 'flow'` (manual swim-lane positioning is cleaner than fighting ELK partitioning, which groups nodes into the *same* layer rather than into adjacent columns). System diagrams still use ELK `direction: 'RIGHT'`. `FlowStepNode` handles flipped to `Top`/`Bottom`.
- [x] Steps grouped into vertical swim lanes by `componentId` (first-appearance order). Lane headers across the top show component icon + label + step count.
- [x] When there's only one unique `componentId` in the flow (mono-component, share===1.0 by definition), lanes are skipped — single column layout, no header. The existing "mostly internal to X" banner in `DiagramMeta` carries the explanation.
- [x] Cross-lane edges (different `componentId` on source vs target) get a heavier dashed blue stroke (`rgba(96,165,250,0.95)`, dasharray 6/4) vs in-lane edges (lighter solid).

## 2. Trigger node, not floating banner

**Gap:** the trigger description card sits absolute-positioned top-left of the canvas (`DiagramMeta` in `DiagramCanvas.tsx:162`). It's disconnected from step 1 — no edge, no arrow, no anchor — even though it represents "where the flow starts". After fit-view, there's a wide empty band between the banner and the strip of nodes.

- [ ] Make the trigger a real first node in the flow graph (`type: 'flowTrigger'`). Source-only handle, no target. Edge to step 1 has a labelled "trigger" marker.
- [ ] Move the textual trigger description (`Operator runs the once-per-day pipeline that ingests fresh research…`) into the topbar/breadcrumb area or a collapsible "About this flow" pill, not a floating overlay on the canvas.
- [ ] Style trigger node distinctly by trigger kind — `cli` gets a terminal-prompt chip, `http` gets a `GET /…` chip, `event` gets an upstream-component chip, `cron` shows the cadence if known.

## 3. Step card redesign

**Gap:** today's `FlowStepNode` packs four things into one ~240px box: a number, a verb phrase, a component icon+label, and a "drill in →" microcopy. Visual hierarchy is weak; the component (most useful for orientation) is the smallest text on the card.

- [ ] Promote the component to a left lane-chip with the kind icon + label — make it visually heavier than the action verb.
- [ ] Make the whole card the drill target when `subDiagramId` is set. Today only the card body around the inline "drill in →" link drills; the link itself is redundant. Replace it with a single corner chevron + hover state ("↘ 4 sub-steps").
- [ ] Drop the `×` hide button on flow steps (`FlowStepNode.tsx:44-54`). Hiding step 4 of a 7-step flow yields a meaningless 6-step flow; hide makes sense on system diagrams (filter views), not on linear narratives. Keep `×` on `ComponentNode` only.
- [ ] Show step description (currently always blank — see item 9) on the card or in a tooltip.

## 4. Inline sub-flow expansion instead of nav-away

**Gap:** drilling into a sub-flow loses the parent context entirely — new page, only "Back". For a 7-step parent with a 4-step sub-flow at step 3, the user wants to see *the sub-flow inserted in place*, not the parent replaced.

- [ ] On a flow page, hovering a step with `subDiagramId` shows a small preview chip "↘ 4 sub-steps · parses JSON-RPC → charges budget → runs FTS5 → audit".
- [ ] Clicking the chevron *expands* that step in-place into its sub-steps (animated, indented under the parent). Clicking again collapses. State persisted in the URL hash (`#expand=flow.x.s3`).
- [ ] Alternatively (or additionally): a split-pane mode where the sub-flow opens on the right, parent stays visible on the left — like a docs-style "expand inline" pattern.
- [ ] Keep the current "navigate to sub-flow as its own page" route as a fallback (deep-linkable).

## 5. Sidebar flow grouping

**Gap:** the sidebar groups flows by `trigger` (`http` / `cli` / `event`) and then lists them alphabetically *mixed with their own sub-flows*. Result: in the `cli` group on the gimli run, "Daily trade pipeline run" is immediately followed by its sub-flow "dispatches trade-pipeline run-once subcommand (sub-flow)" — but *also* by unrelated top-level flow "Earnings transcript ingest + summary" because both have `trigger: cli`. The hierarchy is there but the visual treatment hides it.

- [ ] Within each trigger group, only render *top-level* flows at depth 0; their sub-flows nest beneath via the existing `TreeNode` recursion (already wired in `Sidebar.tsx:179-189`).
- [ ] Sort top-level flows by name; sort sub-flows by `order` (which the orchestrator can persist as a meta field) rather than alphabetical.
- [ ] Differentiate the leading-glyph: `▸`/`▾` for nodes with children, **nothing** (not a `·`) for leaves. The current `tree-chevron-empty: '·'` (`Sidebar.tsx:173`) reads as a bullet and makes hierarchy ambiguous.
- [ ] Consider dropping trigger groups entirely on the sidebar in favour of pure parent-hierarchy grouping with a small trigger-icon chip next to each top-level flow.

## 6. Flow-shape glyph on each sidebar entry

**Gap:** L1 has 18 flow entries in the gimli run; clicking through each to see the shape is the only way to discover content. A 5–7 px sparkline-style indicator per entry (one colored dot per step, colored by component kind) would let users scan "this is a Trade-Pipeline monoflow, this one crosses 4 components" without navigating.

- [ ] Compute the per-flow step→component colour sequence at index-write time (`src/model/writer.ts`). Stash on the flow index entry, e.g. `shape: ['cli','job','service','external','service','service','library']`.
- [ ] Sidebar `TreeNode` renders a thin row of 5px squares using `styleForKind(...).accent`. Truncate to first 7 with a `…` if longer.
- [ ] Tooltip on hover lists the step count and unique-component count.

## 7. WebSocket spam in serve mode

**Gap:** in `viszi serve` mode the React app keeps trying to open `ws://…/ws/progress` and emits 6 "WebSocket connection failed" errors before giving up. There's no live analysis happening so the WS isn't even useful in this mode.

- [ ] In `serve.ts` set a meta flag (e.g. `meta.json: { mode: 'serve' }`) and check it in the web client (`src/web/components/ProgressBanner.tsx` or wherever the WS connect lives). If `mode === 'serve'`, don't open the socket at all.
- [ ] Alternatively have the serve-mode server accept the upgrade and immediately close cleanly, so the client gets a single close event rather than 6 retries.

## 8. Step → file linkage

**Gap:** every flow step has `files: []`. The FilesPanel only opens for system-diagram nodes; clicking a flow step never opens it. But the most natural question after reading "runs FTS5 query against catalog.sqlite3" is "show me the function that does that."

- [ ] Extend `SubFlowSchema` and `FlowsSchema` in `src/ai/schemas.ts` to include an optional `files: string[]` per step (max 5 items, sourced from the step's `componentId`'s file list).
- [ ] Bump `SCHEMA_VERSION` so existing caches re-run for the new field.
- [ ] Tighten the flow prompt to ask Claude to cite the one or two files that implement each step, drawing from the component's `members[]` list it already has in context.
- [ ] Wire `FilesPanel` onto `FlowStepNode` clicks (or a sub-button) when `files.length > 0`.

## 9. Step descriptions

**Gap:** `FlowsSchema` already allows an optional `description` per step (`schemas.ts:99`), but it's empty on every gimli flow node — the prompt doesn't ask for it. So step cards show only the verb-phrase title.

- [ ] Update the flow-generation prompt to require a 1-line `description` per step explaining *why* (constraint or business intent), in addition to the existing `action` (what mechanically happens).
- [ ] Render the description on the card (1 line, faded, below the action), or in a tooltip — and definitely on the inline-expanded sub-flow rows (item 4).

## 10. L1 page should surface flows, not bury them

**Gap:** the L1 system page renders the component diagram in the canvas and pushes the 18 flow entries into a long-scroll sidebar list. Most viewers land at L1 and want to ask "how does the system *do* anything?" — flows answer that, but discoverability is poor.

- [ ] Add a small "Flows" strip below the L1 canvas (or as a docked panel): chip-style cards showing trigger icon + name + shape glyph (item 6). 4–6 visible, more on scroll.
- [ ] On each L1 component node, show a small badge "starts 3 flows · participates in 7" with a click-through to a filtered flow list. Computable client-side from `flow.steps[].componentId`.

## 11. Topbar counter is for operators, not viewers

**Gap:** the topbar shows `73 diagrams · 32 AI calls`. That's an analytics tally — useful while the analysis is running, useless to someone clicking through the result a week later. The screen real estate could carry breadcrumbs instead.

- [ ] When `progress.state === 'idle'` (i.e. analysis finished or we're in serve mode), replace the counter with a clickable breadcrumb: `gimli ← Trade Pipeline ← Trade Pipeline Command`.
- [ ] During analysis, keep the live counter (and add the cost meter from 007 #14).

## 12. Mini-map is useless on linear flows

**Gap:** the React Flow mini-map shows the flow as a thin blue bar — no spatial information to use.

- [ ] Hide the mini-map when `diagram.kind === 'flow'` and `nodes.length < 10` (i.e. nothing useful to scroll *to*).
- [ ] Keep it for system diagrams where it earns its keep.

## 13. Regenerate button should fire, not copy

**Gap:** the topbar Regenerate button copies `viszi regen <id>` to the clipboard. The user then has to switch terminals and paste. In serve mode where the analysis runner is dormant, that makes sense; in analyze-mode the server is alive and could just run it.

- [ ] Detect serve vs. analyze mode (item 7 `meta.mode`). In analyze mode, POST to a new `/regen/:diagramId` endpoint that invalidates the cache key and triggers a single AI call.
- [ ] Stream the resulting `ai` event over the existing progress WS; the canvas re-renders when the new diagram lands.
- [ ] Keep the copy-to-clipboard fallback for serve mode (and surface it as such — "Re-run with: `viszi regen …`").

---

## Bigger ideas (separate threads)

### A. Branching / parallel flow steps

`FlowsSchema` today implies a linear chain (steps are `order`-indexed integers, edges are inferred sequential). Real-world flows fan out — "spawn 7 council seats in parallel and aggregate", "fanout 50 ticker theses concurrently". The gimli run has at least three such cases that the model collapsed into a single step labelled "runs seven council seats" or "Fan out trade-generation runs in parallel". Schema work needed: optional `parallelGroup: string` on steps so steps with the same group render as siblings under a fanout marker.

### B. Flow as a story, not a graph

For some flows (linear ones with rich descriptions) a left-to-right node graph isn't even the right primitive — a vertical timeline with one card per step, with timestamps/components in a left rail and description in the body, would read more naturally. Consider a `viewMode: 'graph' | 'story'` toggle.

### C. Cross-flow trace links

Many sub-flows are referenced by multiple parents (e.g. `flow.71523bceb5ba` "MCP catalog_search tool call" is invoked from the Council review flow). Today the sub-flow page is reached only via the specific drill it was opened from; it should show "called from N flows" with a list.

### D. Animation on play

A "▶ Play" button that animates the active step from 1→N with a slowly travelling highlight on the edges. Sounds toy-ish but is the single most effective way to convey "this is a sequence, not a graph" to a first-time viewer.

---

## How to use this list

Same convention as `007_Post_Launch_TODO.md`:

1. Open a PR titled `feat/fix(009 item N): <one-line summary>`.
2. Tick the boxes in this file in the same PR.
3. Bump `SCHEMA_VERSION` whenever the AI prompt or `FlowsSchema` changes (items 8, 9, A).

**Recommended v0.3-flows milestone**, in order:

1. **#1** (swim lanes + vertical) — single highest-leverage change; turns every flow into a who-does-what diagram.
2. **#3** (step card redesign) — pairs with #1; without it the lanes are wasted on cramped cards.
3. **#9** (descriptions) + **#8** (file linkage) — closes the "what does this step *mean*" gap. Both are schema/prompt changes that ride one `SCHEMA_VERSION` bump.
4. **#4** (inline sub-flow expansion) — the single biggest navigation fix; users stop losing context.
5. **#5 + #6** (sidebar grouping + shape glyphs) — cheap polish, finishes the discovery story.

Defer until v0.4: **#A** (branching schema), **#B** (story view), **#C** (cross-flow links), **#D** (animation).
