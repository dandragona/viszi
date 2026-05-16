import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { absolutize, cacheSubdir, defaultOutputDir, indexFile, metaFile, diagramsSubdir, sanitizeId } from '../../shared/paths.js';
import { Logger, k } from '../logger.js';
import { runAnalyzeCommand } from './analyze.js';

export interface RegenArgs {
  diagramId: string;
  path?: string;
  output?: string;
  verbose?: boolean;
  quiet?: boolean;
}

export async function runRegenCommand(args: RegenArgs): Promise<number> {
  const log = new Logger(args.quiet ? 'quiet' : args.verbose ? 'verbose' : 'normal');
  const repoRoot = absolutize(args.path ?? process.cwd());
  const outputDir = args.output ? absolutize(args.output, repoRoot) : defaultOutputDir(repoRoot);

  if (!existsSync(indexFile(outputDir))) {
    log.error(`No analysis found at ${k.cyan(outputDir)}. Run \`viszi\` first.`);
    return 1;
  }
  if (!existsSync(metaFile(outputDir))) {
    log.error(`No meta.json found in ${k.cyan(outputDir)} — cannot reconstruct run options.`);
    return 1;
  }

  const diagramPath = resolve(diagramsSubdir(outputDir), `${sanitizeId(args.diagramId)}.json`);
  if (!existsSync(diagramPath)) {
    log.error(`Diagram ${k.cyan(args.diagramId)} not found in ${k.cyan(outputDir)}.`);
    return 1;
  }

  const diagram = JSON.parse(readFileSync(diagramPath, 'utf8')) as {
    meta?: { regenCacheKey?: string };
    title?: string;
  };
  const cacheFilename = diagram.meta?.regenCacheKey;
  if (!cacheFilename) {
    log.error(
      `Diagram ${k.cyan(args.diagramId)} has no \`meta.regenCacheKey\`. Was it produced by a viszi build older than this version? Re-run a full analysis (\`viszi\`) once to repopulate the key.`,
    );
    return 1;
  }

  const cacheFile = resolve(cacheSubdir(outputDir), cacheFilename);
  if (existsSync(cacheFile)) {
    rmSync(cacheFile, { force: true });
    log.info(`Invalidated ${k.cyan(cacheFilename)}`);
  } else {
    log.info(`No cache entry to invalidate (already fresh): ${cacheFilename}`);
  }

  // Reload the original run options from meta.json so the re-run uses the same
  // levels / flows / output / etc. as the first analysis.
  const savedMeta = JSON.parse(readFileSync(metaFile(outputDir), 'utf8')) as {
    levels?: number;
    flowsEnabled?: boolean;
  };

  log.info(`Regenerating ${k.cyan(diagram.title ?? args.diagramId)}…`);
  return runAnalyzeCommand({
    path: repoRoot,
    levels: savedMeta.levels ?? 2,
    flows: savedMeta.flowsEnabled !== false,
    output: outputDir,
    open: false,
    serve: false,
    concurrency: 4,
    cache: true,
    dryRun: false,
    bare: false,
    verbose: !!args.verbose,
    quiet: !!args.quiet,
  });
}
