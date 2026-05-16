import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { traverse } from '../analyzer/traverse.js';
import { parseFile, type ParsedFile } from '../analyzer/parsers/index.js';
import { buildDependencyGraph, summarize } from '../analyzer/graph.js';
import { clusterIntoModules, modulesForPrompt, type Module } from '../analyzer/modules.js';
import { detectEntrypoints, type Entrypoint } from '../analyzer/entrypoints.js';
import { isCode } from '../analyzer/languages.js';
import { DiagramWriter } from '../model/writer.js';
import type {
  AnyDiagram,
  ComponentKind,
  DiagramEdge,
  DiagramNode,
  EdgeKind,
  FlowDiagram,
  FlowStep,
  FlowTrigger,
  SystemDiagram,
} from '../model/types.js';
import { shortHash } from '../shared/paths.js';
import { callClaude, ClaudeUnavailableError, isClaudeAvailable } from './claude.js';
import { ComponentsSchema, FlowsSchema } from './schemas.js';
import { buildComponentsPrompt } from './prompts/components.js';
import { buildFlowsPrompt } from './prompts/flows.js';
import { AiCache } from './cache.js';

export interface OrchestratorOpts {
  repoRoot: string;
  outputDir: string;
  levels: number;
  flowsEnabled: boolean;
  concurrency: number;
  maxBudgetUsd?: number;
  cache: boolean;
  model?: string;
  bare?: boolean;
  dryRun?: boolean;
  config?: VisziConfig;
  /**
   * Push the analysis start point one or more directories deeper. Useful for
   * `src/<one-package>/...` shaped repos where the L1 root system would
   * otherwise collapse into one giant component. Path is relative to repoRoot;
   * a leading/trailing slash is tolerated. See TODO 007 #11.
   */
  rootScope?: string;
  onProgress?: (event: ProgressEvent) => void;
  /** Called whenever a diagram is added to the writer (live broadcast hook). */
  onDiagramAdded?: (diagram: AnyDiagram) => void;
}

export interface VisziConfig {
  exclude?: string[];
  include?: string[];
  modules?: Record<string, string[]>;
  componentKinds?: Record<string, ComponentKind>;
  flows?: { include?: string[]; exclude?: string[] };
  ai?: { model?: string; maxBudgetUsd?: number; concurrency?: number };
}

export type ProgressEvent =
  | { phase: 'scan'; message: string }
  | { phase: 'parse'; processed: number; total: number }
  | { phase: 'cluster'; moduleCount: number }
  | { phase: 'ai'; kind: 'components' | 'flows'; scope: string; level: number; cached: boolean; durationMs?: number }
  | { phase: 'write'; diagrams: number }
  | { phase: 'hint'; message: string }
  | { phase: 'done'; rootSystemId: string };

interface ClaudeComponentsResp {
  components: Array<{
    id: string;
    label: string;
    kind: ComponentKind;
    description: string;
    members: string[];
  }>;
  edges: Array<{
    source: string;
    target: string;
    kind: EdgeKind;
    label?: string;
  }>;
}

interface ClaudeFlowsResp {
  flows: Array<{
    id: string;
    name: string;
    description: string;
    trigger: FlowTrigger;
    steps: Array<{
      order: number;
      componentId: string;
      action: string;
      description?: string;
    }>;
  }>;
}

export interface RunResult {
  rootSystemId: string;
  diagramCount: number;
  aiCallCount: number;
  estimatedCostUsd: number;
}

function normalizeRootScope(raw?: string): string {
  if (!raw) return '';
  return raw.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

export async function runAnalysis(opts: OrchestratorOpts): Promise<RunResult> {
  const baseWriter = new DiagramWriter({
    outputDir: opts.outputDir,
    repoRoot: opts.repoRoot,
    levels: opts.levels,
    flowsEnabled: opts.flowsEnabled,
  });
  // Wrap writer.add so each new diagram is also broadcast.
  const onDiagramAdded = opts.onDiagramAdded;
  const writer: DiagramWriter = onDiagramAdded
    ? new Proxy(baseWriter, {
        get(target, prop, receiver) {
          if (prop === 'add') {
            return (d: AnyDiagram) => {
              target.add(d);
              onDiagramAdded(d);
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      })
    : baseWriter;
  const cache = new AiCache(opts.outputDir, opts.cache);
  const progress = opts.onProgress ?? (() => {});

  if (!opts.dryRun) {
    if (!(await isClaudeAvailable())) throw new ClaudeUnavailableError();
  }

  const rootScope = normalizeRootScope(opts.rootScope);

  // ─── Stage A: full-repo scan ────────────────────────────────────────────
  progress({
    phase: 'scan',
    message: rootScope ? `Walking ${rootScope}/` : 'Walking repository',
  });
  const allFiles = await traverse({
    root: opts.repoRoot,
    scope: rootScope || undefined,
    extraExcludes: opts.config?.exclude,
    includeOnly: opts.config?.include,
  });

  const codeFiles = allFiles.filter((f) => isCode(f.language));
  const parsed: ParsedFile[] = [];
  let processed = 0;
  for (const f of codeFiles) {
    const p = parseFile(f.abs, f.rel, f.language);
    if (p) parsed.push(p);
    processed++;
    if (processed % 50 === 0 || processed === codeFiles.length) {
      progress({ phase: 'parse', processed, total: codeFiles.length });
    }
  }

  const fullGraph = buildDependencyGraph({ repoRoot: opts.repoRoot, parsed });
  const fullEntrypoints = detectEntrypoints({ repoRoot: opts.repoRoot, parsed });

  // ─── Stage B: recursive level loop ──────────────────────────────────────
  const rootSystemId = systemDiagramId(rootScope);
  await analyzeSystemTier({
    scope: rootScope,
    level: 1,
    parentId: undefined,
    parentLabel: undefined,
    parentDescription: undefined,
    parsed,
    opts,
    writer,
    cache,
    progress,
  });

  {
    const rootSystem = writer.get(rootSystemId);
    if (rootSystem && rootSystem.kind === 'system') {
      maybeSuggestRootScope(rootSystem, opts, rootScope, progress);
    }
  }

  if (opts.flowsEnabled) {
    const rootSystem = writer.get(rootSystemId);
    if (rootSystem && rootSystem.kind === 'system') {
      await analyzeFlowsTier({
        scope: rootScope,
        level: 1,
        parentId: undefined,
        parentFlowName: undefined,
        parentStepAction: undefined,
        components: rootSystem.nodes,
        entrypoints: fullEntrypoints,
        graphSummary: summarize(fullGraph),
        opts,
        writer,
        cache,
        progress,
      });
    }
  }

  const index = writer.flush(rootSystemId);
  progress({ phase: 'write', diagrams: index.diagrams.length });
  progress({ phase: 'done', rootSystemId });
  return {
    rootSystemId,
    diagramCount: index.diagrams.length,
    aiCallCount: index.meta.aiCallCount,
    estimatedCostUsd: index.meta.estimatedCostUsd ?? 0,
  };
}

// ─── System-tier analysis (recursive) ─────────────────────────────────────

interface SystemTierArgs {
  scope: string;
  level: number;
  parentId?: string;
  parentLabel?: string;
  parentDescription?: string;
  /** When recursing, the parent has promised this exact id as the child diagram. */
  idOverride?: string;
  /** Optional title override for nicer recursive diagram titles. */
  titleOverride?: string;
  parsed: ParsedFile[];
  opts: OrchestratorOpts;
  writer: DiagramWriter;
  cache: AiCache;
  progress: (e: ProgressEvent) => void;
}

async function analyzeSystemTier(args: SystemTierArgs): Promise<SystemDiagram | undefined> {
  const { scope, level, opts, writer, cache, parsed, progress } = args;

  const scopedParsed = scope ? parsed.filter((p) => p.rel.startsWith(scope.replace(/\\/g, '/'))) : parsed;
  if (scopedParsed.length === 0) return undefined;

  const subgraph = buildDependencyGraph({ repoRoot: opts.repoRoot, parsed: scopedParsed });
  const modules = clusterIntoModules(subgraph, scope);
  if (modules.length === 0) return undefined;

  progress({ phase: 'cluster', moduleCount: modules.length });

  const promptInput = {
    scope,
    level,
    totalLevels: opts.levels,
    parentLabel: args.parentLabel,
    parentDescription: args.parentDescription,
    modules: modulesForPrompt(modules) as Array<unknown>,
    graphSummary: summarize(subgraph),
  };
  const prompt = buildComponentsPrompt({
    ...promptInput,
    modules: promptInput.modules as ReturnType<typeof modulesForPrompt>,
  });

  const cacheKey = {
    promptName: 'components',
    scope,
    level,
    contentHash: AiCache.hashContent(promptInput),
  };
  let resp = cache.get<ClaudeComponentsResp>(cacheKey);
  const cached = !!resp;
  let durationMs: number | undefined;

  if (!resp) {
    if (opts.dryRun) {
      resp = mockComponents(modules);
    } else {
      const result = await callClaude<ClaudeComponentsResp>({
        prompt,
        schema: ComponentsSchema,
        cwd: opts.repoRoot,
        maxBudgetUsd: opts.maxBudgetUsd,
        model: opts.model,
        bare: opts.bare,
        addDirs: [opts.repoRoot],
      });
      resp = result.data;
      durationMs = result.durationMs;
      writer.recordAiCall(result.costUsd ?? 0);
    }
    cache.set(cacheKey, resp);
  } else {
    writer.recordAiCall(0);
  }

  progress({ phase: 'ai', kind: 'components', scope, level, cached, durationMs });

  const diagram = buildSystemDiagram({
    scope,
    level,
    parentId: args.parentId,
    response: resp,
    modules,
    opts,
    idOverride: args.idOverride,
    titleOverride: args.titleOverride,
  });
  writer.add(diagram);

  // Recurse: build a sub-diagram for each component if not at max depth.
  if (level < opts.levels) {
    const concurrency = Math.max(1, opts.concurrency);
    const queue = diagram.nodes.filter((n) => n.subDiagramId);
    for (let i = 0; i < queue.length; i += concurrency) {
      const batch = queue.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (node) => {
          const subParsed = filterParsedToNode({ parsed, node, modules });
          if (subParsed.length === 0) {
            node.subDiagramId = undefined;
            return;
          }
          await analyzeSystemTier({
            scope: deriveScopeFromFiles(subParsed) ?? scope,
            level: level + 1,
            parentId: diagram.id,
            parentLabel: node.label,
            parentDescription: node.description,
            idOverride: node.subDiagramId,
            titleOverride: `${node.label} — Level ${level + 1}`,
            parsed: subParsed,
            opts,
            writer,
            cache,
            progress,
          });
        }),
      );
    }
  }

  return diagram;
}

function filterParsedToNode(args: {
  parsed: ParsedFile[];
  node: DiagramNode;
  modules: Module[];
}): ParsedFile[] {
  const fileSet = new Set(args.node.files);
  return args.parsed.filter((p) => fileSet.has(p.rel));
}

function deriveScopeFromFiles(parsed: ParsedFile[]): string | undefined {
  if (parsed.length === 0) return undefined;
  const first = parsed[0].rel.split('/').slice(0, 2).join('/');
  return parsed.every((p) => p.rel.startsWith(first.split('/')[0])) ? first.split('/')[0] : undefined;
}

function buildSystemDiagram(args: {
  scope: string;
  level: number;
  parentId?: string;
  response: ClaudeComponentsResp;
  modules: Module[];
  opts: OrchestratorOpts;
  idOverride?: string;
  titleOverride?: string;
}): SystemDiagram {
  const { scope, level, parentId, response, modules, opts } = args;
  const moduleById = new Map(modules.map((m) => [m.id, m]));
  const id = args.idOverride ?? systemDiagramId(scope);

  const nodes: DiagramNode[] = response.components.map((c) => {
    const memberFiles = uniqueFiles(c.members.flatMap((mid) => resolveMemberFiles(mid, modules, moduleById, scope)));
    const subId = level < opts.levels && memberFiles.length > 0 ? `${id}.${sanitizeIdLowerForId(c.id)}` : undefined;
    return {
      id: c.id,
      label: c.label,
      kind: c.kind,
      description: c.description,
      files: memberFiles,
      subDiagramId: subId,
      meta: {
        loc: memberFiles.length === 0 ? 0 : memberFiles.reduce((acc, f) => {
          const m = modules.find((mm) => mm.files.includes(f));
          return acc + (m ? Math.round((m.loc / m.files.length) * 1) : 0);
        }, 0),
      },
    };
  });

  const validIds = new Set(nodes.map((n) => n.id));
  const edges: DiagramEdge[] = response.edges
    .filter((e) => validIds.has(e.source) && validIds.has(e.target) && e.source !== e.target)
    .map((e, i) => ({
      id: `${e.source}__${e.target}__${i}`,
      source: e.source,
      target: e.target,
      kind: e.kind,
      label: e.label,
    }));

  const title =
    args.titleOverride ??
    (scope === '' ? `${baseDirName(opts.repoRoot)} — System (Level ${level})` : `${scope} — Level ${level}`);

  return {
    id,
    kind: 'system',
    level,
    parentId,
    scope: scope || '/',
    title,
    nodes,
    edges,
  };
}

/**
 * Map a Claude-returned `member` id to the analyzer files it references.
 *
 * Claude often invents finer- or coarser-grained module ids than the analyzer
 * actually produced. This resolver handles three cases so the drill-through
 * chain doesn't silently break (#8 in 007_Post_Launch_TODO):
 *   1. Exact match — current behavior, fast path.
 *   2. Claude refined further (e.g. mid="app/cli" while only "app" exists):
 *      find the coarser parent module and filter its files to those whose
 *      scope-relative path starts with `mid + "/"`.
 *   3. Claude returned a coarser id (mid="app" while "app/cli", "app/api"
 *      exist): union the children's files.
 */
export function resolveMemberFiles(
  mid: string,
  modules: Module[],
  moduleById: Map<string, Module>,
  scope: string,
): string[] {
  const direct = moduleById.get(mid);
  if (direct) return direct.files;

  const sp = scope.replace(/[/\\]+$/, '');
  const stripScope = (rel: string): string => {
    const norm = rel.replace(/\\/g, '/');
    if (!sp) return norm;
    return norm.startsWith(sp + '/') ? norm.slice(sp.length + 1) : norm;
  };

  // 2. Claude refined further than the analyzer did.
  const parent = modules.find((m) => mid.startsWith(m.id + '/'));
  if (parent) {
    const matched = parent.files.filter((f) => stripScope(f).startsWith(mid + '/'));
    if (matched.length > 0) return matched;
  }

  // 3. Claude returned a coarser id than the analyzer did.
  const childModules = modules.filter((m) => m.id.startsWith(mid + '/'));
  if (childModules.length > 0) {
    return childModules.flatMap((m) => m.files);
  }

  return [];
}

function uniqueFiles(files: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of files) {
    if (seen.has(f)) continue;
    seen.add(f);
    out.push(f);
  }
  return out;
}

function baseDirName(p: string): string {
  return p.split(/[/\\]/).filter(Boolean).pop() ?? 'codebase';
}

/**
 * Suggest `--root-scope <X>` to the user when the L1 diagram is dominated by
 * a single component (≥75% of LOC). Common for `src/<one-package>/...` repos.
 * #11 in 007_Post_Launch_TODO.
 */
function maybeSuggestRootScope(
  rootSystem: SystemDiagram,
  opts: OrchestratorOpts,
  currentScope: string,
  progress: (e: ProgressEvent) => void,
): void {
  if (currentScope) return; // user already supplied a root scope
  if (rootSystem.nodes.length < 2) return;
  const totalLoc = rootSystem.nodes.reduce((acc, n) => acc + ((n.meta?.loc as number | undefined) ?? 0), 0);
  if (totalLoc <= 0) return;
  const dominant = [...rootSystem.nodes].sort(
    (a, b) => ((b.meta?.loc as number | undefined) ?? 0) - ((a.meta?.loc as number | undefined) ?? 0),
  )[0];
  const dominantLoc = (dominant.meta?.loc as number | undefined) ?? 0;
  if (dominantLoc / totalLoc < 0.75) return;
  // Pick a likely scope by looking at the dominant component's files.
  const sample = dominant.files[0]?.replace(/\\/g, '/');
  if (!sample) return;
  const parts = sample.split('/').filter(Boolean);
  if (parts.length < 2) return;
  const suggestedScope = parts.slice(0, 2).join('/');
  progress({
    phase: 'hint',
    message:
      `One L1 component (${dominant.label}) holds ${Math.round((dominantLoc / totalLoc) * 100)}% of the LOC.\n` +
      `      For a more useful Level 1, re-run with ${'`'}--root-scope ${suggestedScope}${'`'}.`,
  });
  void opts;
}

function systemDiagramId(scope: string, suffix?: string): string {
  const base = scope ? `system.${shortHash(scope)}` : 'system.root';
  return suffix ? `${base}.${suffix}` : base;
}

// ─── Flow-tier analysis ──────────────────────────────────────────────────

interface FlowTierArgs {
  scope: string;
  level: number;
  parentId?: string;
  parentFlowName?: string;
  parentStepAction?: string;
  /** When recursing into a step, the parent has promised this id for the
   * single sub-flow. We use it as the id for the *first* flow we generate. */
  singleFlowIdOverride?: string;
  singleFlowTitleOverride?: string;
  components: DiagramNode[];
  entrypoints: Entrypoint[];
  graphSummary: { files: number; loc: number; edges: number };
  opts: OrchestratorOpts;
  writer: DiagramWriter;
  cache: AiCache;
  progress: (e: ProgressEvent) => void;
}

async function analyzeFlowsTier(args: FlowTierArgs): Promise<void> {
  const { scope, level, components, entrypoints, opts, writer, cache, progress } = args;
  if (components.length === 0) return;

  const summary = components.map((c) => ({
    id: c.id,
    label: c.label,
    kind: c.kind,
    description: c.description,
  }));

  const promptInput = {
    scope,
    level,
    totalLevels: opts.levels,
    componentSummary: summary,
    entrypoints: entrypoints.slice(0, 30),
    graphSummary: args.graphSummary,
    parentFlowName: args.parentFlowName,
    parentStepAction: args.parentStepAction,
  };

  const cacheKey = {
    promptName: level === 1 ? 'flows' : 'subflows',
    scope,
    level,
    contentHash: AiCache.hashContent(promptInput),
  };
  let resp = cache.get<ClaudeFlowsResp>(cacheKey);
  const cached = !!resp;
  let durationMs: number | undefined;

  if (!resp) {
    if (opts.dryRun) {
      resp = mockFlows(summary, entrypoints);
    } else {
      const result = await callClaude<ClaudeFlowsResp>({
        prompt: buildFlowsPrompt(promptInput),
        schema: FlowsSchema,
        cwd: opts.repoRoot,
        maxBudgetUsd: opts.maxBudgetUsd,
        model: opts.model,
        bare: opts.bare,
        addDirs: [opts.repoRoot],
      });
      resp = result.data;
      durationMs = result.durationMs;
      writer.recordAiCall(result.costUsd ?? 0);
    }
    cache.set(cacheKey, resp);
  } else {
    writer.recordAiCall(0);
  }

  progress({ phase: 'ai', kind: 'flows', scope, level, cached, durationMs });

  for (let fi = 0; fi < resp.flows.length; fi++) {
    const f = resp.flows[fi];
    const idOverride = fi === 0 ? args.singleFlowIdOverride : undefined;
    const titleOverride = fi === 0 ? args.singleFlowTitleOverride : undefined;
    const flow = buildFlowDiagram({
      flow: f,
      level,
      parentId: args.parentId,
      components,
      scope,
      idOverride,
      titleOverride,
    });
    writer.add(flow);

    // Recurse: drill into each step that maps to a component which itself has
    // a sub-system diagram. Limit branching so we don't explode AI usage.
    // Skip steps whose component has no sub-system — drilling them produces
    // a re-labelling of the parent at the same granularity (#12 in
    // 007_Post_Launch_TODO).
    if (level < opts.levels) {
      const concurrency = Math.max(1, opts.concurrency);
      const drillable = flow.steps.filter((s) => {
        if (s.subDiagramId !== undefined) return false;
        const comp = components.find((c) => c.id === s.componentId);
        return Boolean(comp?.subDiagramId);
      });
      const stepsToExpand = drillable.slice(0, Math.min(3, drillable.length));
      for (let i = 0; i < stepsToExpand.length; i += concurrency) {
        const batch = stepsToExpand.slice(i, i + concurrency);
        await Promise.all(
          batch.map(async (step) => {
            const comp = components.find((c) => c.id === step.componentId);
            if (!comp || comp.files.length === 0) return;
            const subParsed = readScopedParsed(opts.repoRoot, comp.files);
            if (subParsed.length === 0) return;
            const subGraph = buildDependencyGraph({ repoRoot: opts.repoRoot, parsed: subParsed });
            const subEntries = detectEntrypoints({ repoRoot: opts.repoRoot, parsed: subParsed });
            const subSystem = writer.get(comp.subDiagramId ?? '');
            const subComponents =
              subSystem && subSystem.kind === 'system' ? subSystem.nodes : summary.map((s) => ({ ...s, files: [] } as DiagramNode));
            const subFlowId = `${flow.id}.${shortHash(step.id, 8)}`;
            step.subDiagramId = subFlowId;
            await analyzeFlowsTier({
              scope: scope || comp.id,
              level: level + 1,
              parentId: flow.id,
              parentFlowName: flow.title,
              parentStepAction: step.action,
              singleFlowIdOverride: subFlowId,
              singleFlowTitleOverride: `${step.action} (sub-flow)`,
              components: subComponents as DiagramNode[],
              entrypoints: subEntries,
              graphSummary: summarize(subGraph),
              opts,
              writer,
              cache,
              progress,
            });
          }),
        );
      }
    }
  }
}

function readScopedParsed(repoRoot: string, files: string[]): ParsedFile[] {
  const out: ParsedFile[] = [];
  for (const rel of files) {
    const abs = resolve(repoRoot, rel);
    let source = '';
    try {
      source = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const langGuess = guessLanguageFromPath(rel);
    const p = parseFile(abs, rel, langGuess);
    if (p) out.push(p);
    void source;
  }
  return out;
}

function guessLanguageFromPath(rel: string) {
  const lower = rel.toLowerCase();
  if (lower.endsWith('.tsx')) return 'tsx' as const;
  if (lower.endsWith('.ts') || lower.endsWith('.mts') || lower.endsWith('.cts')) return 'typescript' as const;
  if (lower.endsWith('.jsx')) return 'jsx' as const;
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript' as const;
  if (lower.endsWith('.py')) return 'python' as const;
  if (lower.endsWith('.go')) return 'go' as const;
  return 'unknown' as const;
}

function buildFlowDiagram(args: {
  flow: ClaudeFlowsResp['flows'][number];
  level: number;
  parentId?: string;
  components: DiagramNode[];
  scope: string;
  idOverride?: string;
  titleOverride?: string;
}): FlowDiagram {
  const { flow, level, parentId, components, scope } = args;
  const id = args.idOverride ?? `flow.${shortHash(`${scope}|${flow.id}|${level}`)}`;

  const componentIds = new Set(components.map((c) => c.id));
  const sortedSteps = [...flow.steps].sort((a, b) => a.order - b.order);
  const steps: FlowStep[] = sortedSteps.map((s, i) => ({
    id: `${id}.s${i + 1}`,
    order: i + 1,
    componentId: componentIds.has(s.componentId) ? s.componentId : components[0]?.id ?? 'unknown',
    action: s.action,
    description: s.description,
  }));

  // Build node + edge views suitable for React Flow rendering.
  // NOTE: do not copy `comp.files` into each step's nodes[i].files — the same
  // 100-file list was being inlined N times per flow, blowing search/index size
  // (#9 in 007_Post_Launch_TODO). The frontend resolves files via `componentId`
  // against the parent system diagram when it needs them.
  const nodes: DiagramNode[] = steps.map((s) => {
    const comp = components.find((c) => c.id === s.componentId);
    return {
      id: s.id,
      label: s.action,
      kind: comp?.kind ?? 'unknown',
      description: s.description ?? comp?.label,
      files: [],
      subDiagramId: undefined,
      meta: { componentId: s.componentId, componentLabel: comp?.label, order: s.order },
    };
  });
  const edges: DiagramEdge[] = [];
  for (let i = 0; i < steps.length - 1; i++) {
    edges.push({
      id: `${steps[i].id}->${steps[i + 1].id}`,
      source: steps[i].id,
      target: steps[i + 1].id,
      kind: 'flow',
    });
  }

  return {
    id,
    kind: 'flow',
    level,
    parentId,
    title: args.titleOverride ?? flow.name,
    description: flow.description,
    trigger: flow.trigger,
    steps,
    nodes,
    edges,
  };
}

// ─── Mock responses for --dry-run mode ───────────────────────────────────

function mockComponents(modules: Module[]): ClaudeComponentsResp {
  const components = modules.slice(0, 8).map((m) => ({
    id: sanitizeIdLower(m.id),
    label: prettyLabel(m.id),
    kind: guessKind(m.id) as ComponentKind,
    description: `Auto-generated stub for ${m.id} (${m.files.length} files, ${m.loc} LOC).`,
    members: [m.id],
  }));
  const edges = [];
  for (let i = 0; i < components.length - 1; i++) {
    edges.push({
      source: components[i].id,
      target: components[i + 1].id,
      kind: 'imports' as EdgeKind,
    });
  }
  return { components, edges };
}

function mockFlows(
  components: Array<{ id: string; label: string; kind: string }>,
  entrypoints: Entrypoint[],
): ClaudeFlowsResp {
  if (components.length < 2) {
    return { flows: [] };
  }
  const trigger: FlowTrigger = entrypoints[0]?.kind === 'http' ? 'http' : 'cli';
  return {
    flows: [
      {
        id: 'mock-primary-flow',
        name: 'Primary flow (dry-run stub)',
        description: 'Synthetic flow generated without an AI call.',
        trigger,
        steps: components.slice(0, 5).map((c, i) => ({
          order: i + 1,
          componentId: c.id,
          action: `Step ${i + 1}: ${c.label}`,
          description: `Stub action through ${c.label}`,
        })),
      },
    ],
  };
}

function sanitizeIdLower(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/^[^a-z]/, 'x')
    .slice(0, 40);
}

/** Like sanitizeIdLower but for use inside a diagram id chain (no dots allowed). */
function sanitizeIdLowerForId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 40);
}

function prettyLabel(s: string): string {
  return s
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function guessKind(id: string): ComponentKind {
  const lower = id.toLowerCase();
  if (/(?:^|\b)(db|database|sql|postgres|sqlite|orm)\b/.test(lower)) return 'database';
  if (/queue|worker|consumer|cron|job/.test(lower)) return 'queue';
  if (/cache|redis|memcache/.test(lower)) return 'cache';
  if (/ui|web|frontend|view|page/.test(lower)) return 'ui';
  if (/cli|command|bin/.test(lower)) return 'cli';
  if (/api|controller|router|route|handler/.test(lower)) return 'controller';
  if (/config|env|settings/.test(lower)) return 'config';
  if (/lib|util|helper|shared/.test(lower)) return 'library';
  return 'service';
}
