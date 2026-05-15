import { existsSync } from 'node:fs';
import { startServer } from '../../server/index.js';
import { absolutize, defaultOutputDir, indexFile } from '../../shared/paths.js';
import { Logger, k } from '../logger.js';

export interface ServeArgs {
  path?: string;
  output?: string;
  port?: number;
  open: boolean;
  quiet?: boolean;
  verbose?: boolean;
}

export async function runServeCommand(args: ServeArgs): Promise<number> {
  const verbosity = args.quiet ? 'quiet' : args.verbose ? 'verbose' : 'normal';
  const log = new Logger(verbosity);
  const repoRoot = absolutize(args.path ?? process.cwd());
  const outputDir = args.output ? absolutize(args.output, repoRoot) : defaultOutputDir(repoRoot);

  if (!existsSync(indexFile(outputDir))) {
    log.error(`No analysis found at ${outputDir}. Run \`viszi ${repoRoot}\` first.`);
    return 1;
  }

  try {
    const server = await startServer({
      outputDir,
      port: args.port,
      openBrowser: args.open,
      log: (msg) => log.info(msg),
    });
    log.success(`Open ${k.cyan(server.url)} (Ctrl-C to stop)`);
    await new Promise(() => {});
    return 0;
  } catch (err) {
    log.error(`Server failed: ${(err as Error).message}`);
    return 2;
  }
}
