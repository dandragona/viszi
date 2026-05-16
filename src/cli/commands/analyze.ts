import { existsSync, statSync } from 'node:fs';
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
  output?: string;
  port?: number;
  open: boolean;
  serve: boolean;
  concurrency: number;
  maxBudgetUsd: number;
  cache: boolean;
  dryRun: boolean;
  bare: boolean;
  model?: string;
  verbose?: boolean;
  quiet?: boolean;
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

  const outputDir = args.output ? absolutize(args.output, repoRoot) : defaultOutputDir(repoRoot);
  const cfg = await loadConfig(repoRoot);

  log.info(`Analysing ${k.cyan(repoRoot)} → ${k.gray(outputDir)}`);

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
      case 'ai':
        log.update(
          `${e.cached ? '↺ cache' : '✦ Claude'} ${e.kind} L${e.level} ${e.scope || '/'}` +
            (e.durationMs ? ` (${(e.durationMs / 1000).toFixed(1)}s)` : ''),
        );
        break;
      case 'write':
        log.update(`Writing ${e.diagrams} diagrams`);
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
      concurrency: args.concurrency,
      maxBudgetUsd: args.maxBudgetUsd,
      cache: args.cache,
      model: args.model,
      bare: args.bare,
      dryRun: args.dryRun,
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
