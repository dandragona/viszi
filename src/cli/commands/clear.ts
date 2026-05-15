import { existsSync, rmSync } from 'node:fs';
import { absolutize, defaultOutputDir } from '../../shared/paths.js';
import { Logger, k } from '../logger.js';

export interface ClearArgs {
  path?: string;
  output?: string;
  quiet?: boolean;
}

export async function runClearCommand(args: ClearArgs): Promise<number> {
  const log = new Logger(args.quiet ? 'quiet' : 'normal');
  const repoRoot = absolutize(args.path ?? process.cwd());
  const outputDir = args.output ? absolutize(args.output, repoRoot) : defaultOutputDir(repoRoot);

  if (!existsSync(outputDir)) {
    log.info(`Nothing to clear at ${outputDir}`);
    return 0;
  }
  rmSync(outputDir, { recursive: true, force: true });
  log.success(`Removed ${k.cyan(outputDir)}`);
  return 0;
}
