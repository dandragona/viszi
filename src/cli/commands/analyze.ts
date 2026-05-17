import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAnalysis, type ProgressEvent } from '../../ai/orchestrator.js';
import { absolutize, defaultOutputDir } from '../../shared/paths.js';
import { Logger, k } from '../logger.js';
import { loadConfig } from '../config.js';
import { startServer } from '../../server/index.js';
import { EventBus } from '../../server/eventBus.js';
import { terminateInflightClaude } from '../../ai/claude.js';

export interface AnalyzeArgs {
  path?: string;
  levels: number;
  flows: boolean;
  rootScope?: string;
  output?: string;
  port?: number;
  open: boolean;
  serve: boolean;
  concurrency: number;
  maxBudgetUsd?: number;
  cache: boolean;
  dryRun: boolean;
  bare: boolean;
  model?: string;
  twoStage: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

function formatEta(idx: number, total: number, recentDurationsMs: number[]): string {
  if (recentDurationsMs.length === 0 || idx >= total) return '';
  const avgMs = recentDurationsMs.reduce((a, b) => a + b, 0) / recentDurationsMs.length;
  const remaining = total - idx;
  const etaSec = (remaining * avgMs) / 1000;
  if (etaSec < 5) return '';
  if (etaSec < 90) return ` · ~${Math.round(etaSec)}s left`;
  return ` · ~${Math.round(etaSec / 60)}m left`;
}

export async function runAnalyzeCommand(args: AnalyzeArgs): Promise<number> {
  const verbosity = args.quiet ? 'quiet' : args.verbose ? 'verbose' : 'normal';
  const log = new Logger(verbosity);
  const repoRoot = absolutize(args.path ?? process.cwd());

  if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) {
    log.error(`Not a directory: ${repoRoot}`);
    return 1;
  }
  if (args.levels < 1 || args.levels > 5) {
    log.error(`--levels must be between 1 and 5 (got ${args.levels})`);
    return 1;
  }

  if (args.rootScope) {
    const normalised = args.rootScope.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const scopeAbs = resolve(repoRoot, normalised);
    if (!scopeAbs.startsWith(repoRoot)) {
      log.error(`--root-scope must be inside ${repoRoot} (got ${args.rootScope})`);
      return 1;
    }
    if (!existsSync(scopeAbs) || !statSync(scopeAbs).isDirectory()) {
      log.error(`--root-scope path does not exist or is not a directory: ${scopeAbs}`);
      return 1;
    }
  }

  const outputDir = args.output ? absolutize(args.output, repoRoot) : defaultOutputDir(repoRoot);
  const cfg = await loadConfig(repoRoot);

  log.info(`Analysing ${k.cyan(repoRoot)} → ${k.gray(outputDir)}`);

  const aiCallDurations: number[] = [];
  const onProgress = (e: ProgressEvent) => {
    switch (e.phase) {
      case 'scan':
        log.update(e.message);
        break;
      case 'parse':
        log.update(`Parsing files… ${e.processed}/${e.total}`);
        break;
      case 'cluster':
        log.update(`Clustered into ${e.moduleCount} modules`);
        break;
      case 'plan': {
        const tag = e.refined ? 'Plan (refined)' : 'Plan';
        const cap = e.perCallCapUsd ? ` · per-call cap $${e.perCallCapUsd.toFixed(2)}` : '';
        log.info(
          `${tag}: ~${e.aiCallTotal} AI calls, estimated ≤ ${k.cyan('$' + e.estimatedCostUsd.toFixed(2))}${cap}`,
        );
        break;
      }
      case 'ai': {
        if (typeof e.durationMs === 'number' && !e.cached) {
          aiCallDurations.push(e.durationMs);
          if (aiCallDurations.length > 5) aiCallDurations.shift();
        }
        const idx =
          typeof e.aiCallIndex === 'number' && typeof e.aiCallTotal === 'number'
            ? ` [${e.aiCallIndex}/${e.aiCallTotal}]`
            : '';
        const cost =
          typeof e.cumulativeCostUsd === 'number' && e.cumulativeCostUsd > 0
            ? ` · $${e.cumulativeCostUsd.toFixed(2)}`
            : '';
        const eta =
          typeof e.aiCallIndex === 'number' && typeof e.aiCallTotal === 'number' && aiCallDurations.length > 0
            ? formatEta(e.aiCallIndex, e.aiCallTotal, aiCallDurations)
            : '';
        log.update(
          `${e.cached ? '↺ cache' : '✦ Claude'} ${e.kind} L${e.level} ${e.scope || '/'}${idx}` +
            (e.durationMs ? ` (${(e.durationMs / 1000).toFixed(1)}s)` : '') +
            cost +
            eta,
        );
        break;
      }
      case 'write':
        log.update(`Writing ${e.diagrams} diagrams`);
        break;
      case 'hint':
        log.info(k.yellow('Hint: ') + e.message);
        break;
      case 'done':
        break;
    }
  };

  // If --serve, boot the server BEFORE the analysis so the user can watch
  // live progress over WebSocket. The bus is the bridge.
  const wantsServer = args.serve !== false;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let bus: EventBus | undefined;
  if (wantsServer) {
    bus = new EventBus();
    try {
      server = await startServer({
        outputDir,
        port: args.port,
        openBrowser: args.open,
        log: (msg) => log.debug(msg),
        bus,
      });
      log.info(`Live view at ${k.cyan(server.url)} — generation streams as it runs.`);
    } catch (err) {
      log.fail(`Server failed: ${(err as Error).message}`);
      return 3;
    }
  }

  // Ctrl-C: terminate in-flight `claude` children, close the server, then exit
  // cleanly. Completed cache entries are already flushed to disk by AiCache.set,
  // so a re-run picks up where we left off.
  let interrupted = false;
  const onSigint = () => {
    if (interrupted) {
      // Second Ctrl-C: bail without waiting for cleanup.
      process.exit(130);
    }
    interrupted = true;
    const killed = terminateInflightClaude('SIGTERM');
    log.warn(
      `Interrupted — terminating ${killed} in-flight claude call${killed === 1 ? '' : 's'} and closing server…`,
    );
    void (async () => {
      try {
        bus?.error('Interrupted by user (SIGINT).');
        await server?.close();
      } finally {
        process.exit(130);
      }
    })();
  };
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigint);

  log.start('Walking files…');
  bus?.start();

  let result;
  try {
    result = await runAnalysis({
      repoRoot,
      outputDir,
      levels: args.levels,
      flowsEnabled: args.flows,
      rootScope: args.rootScope,
      concurrency: args.concurrency,
      maxBudgetUsd: args.maxBudgetUsd,
      cache: args.cache,
      model: args.model,
      bare: args.bare,
      dryRun: args.dryRun,
      twoStage: args.twoStage,
      config: cfg,
      onProgress: (e) => {
        onProgress(e);
        bus?.publishProgress(e);
      },
      onDiagramAdded: (d) => bus?.diagramAdded(d),
    });
  } catch (err) {
    bus?.error((err as Error).message);
    log.fail(`Analysis failed: ${(err as Error).message}`);
    if (verbosity === 'verbose') console.error(err);
    return 2;
  }
  log.succeed(
    `Generated ${result.diagramCount} diagrams · ${result.aiCallCount} AI calls` +
      (result.estimatedCostUsd > 0 ? ` · ~$${result.estimatedCostUsd.toFixed(3)}` : ''),
  );
  bus?.done(result);

  if (!wantsServer) {
    log.info(`Diagrams written to ${k.cyan(outputDir)}. Run \`viszi serve ${repoRoot}\` to view.`);
    return 0;
  }

  log.success(`Open ${k.cyan(server!.url)} (Ctrl-C to stop)`);
  await new Promise(() => {}); // run forever
  return 0;
}
