import { cpus } from 'node:os';
import { Command, Option } from 'commander';
import { runAnalyzeCommand } from './commands/analyze.js';
import { runServeCommand } from './commands/serve.js';
import { runClearCommand } from './commands/clear.js';
import { runExportCommand } from './commands/export.js';
import { runInitCommand } from './commands/init.js';
import { runRegenCommand } from './commands/regen.js';
import { viszVersion } from '../shared/version.js';
import { k } from './logger.js';

/**
 * Adaptive default for `--concurrency`. Claude calls are network-bound so we
 * can comfortably outrun the CPU count, but going wider than 8 mostly trades
 * extra rate-limit headroom for diminishing returns. Floor at 4 keeps small
 * machines (CI runners with 2 vCPUs) usefully parallel.
 */
function defaultConcurrency(): number {
  return Math.min(8, Math.max(4, cpus().length));
}

function parseIntStrict(name: string) {
  return (raw: string) => {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) throw new Error(`--${name} must be an integer`);
    return n;
  };
}

function parseFloatStrict(name: string) {
  return (raw: string) => {
    const n = Number(raw);
    if (Number.isNaN(n)) throw new Error(`--${name} must be a number`);
    return n;
  };
}

const program = new Command();

program
  .name('viszi')
  .description(
    'AI-powered multi-tiered system & flow diagrams for any codebase.\n' +
      `Uses your local Claude Code CLI (\`claude -p\`) for inference.`,
  )
  .version(viszVersion(), '-V, --version')
  .helpOption('-h, --help', 'Show help');

program
  .command('analyze', { isDefault: true })
  .description('Analyse a codebase and serve interactive diagrams')
  .argument('[path]', 'Path to the codebase to analyse', '.')
  .option('--levels <n>', 'Tier depth (1-5)', parseIntStrict('levels'), 2)
  .option('--no-flows', 'Skip flow diagram generation')
  .option(
    '--root-scope <relpath>',
    'Treat <relpath> (under the analysed path) as the L1 root. Useful for single-package repos like `src/<pkg>/...`.',
  )
  .option('--output <dir>', 'Output directory (default: <path>/.viszi)')
  .option('--port <n>', 'Server port (default: auto)', parseIntStrict('port'))
  .option('--no-open', "Don't auto-open the browser")
  .option('--no-serve', 'Generate only — do not start the server')
  .option(
    '--concurrency <n>',
    'Parallel Claude calls within a tier. Claude requests are network-bound, so 6-12 is usually fine. Default is adaptive (`min(8, max(4, cpus))`). Cross-tier work (the L1 flow tier + L2 system fanout) already overlaps, so effective parallelism can briefly hit 2× this value.',
    parseIntStrict('concurrency'),
    defaultConcurrency(),
  )
  .option(
    '--max-budget-usd <amount>',
    'Per-call USD budget cap (default: unbounded — passes nothing to `claude --max-budget-usd`)',
    parseFloatStrict('max-budget-usd'),
  )
  .option('--no-cache', 'Disable response cache')
  .option('--dry-run', 'Skip Claude calls; emit synthetic diagrams (offline)')
  .option(
    '--bare',
    'Run Claude in `--bare` mode. Skips user hooks/MCP/CLAUDE.md for predictable analysis, but disables OAuth/keychain auth — requires ANTHROPIC_API_KEY.',
    false,
  )
  .option(
    '--two-stage',
    'Run each scope through a two-stage prompt: a free-text architectural narrative first, then the schema-constrained call seeded with that narrative. Doubles AI calls (and cost) but tends to produce better component names and step labels. See ADR-013.',
    false,
  )
  .addOption(new Option('--model <name>', 'Claude model alias or full id (e.g. opus, sonnet)'))
  .option('-v, --verbose', 'Verbose logging')
  .option('-q, --quiet', 'Errors only')
  .action(async (path: string, opts: Record<string, unknown>) => {
    const code = await runAnalyzeCommand({
      path,
      levels: opts.levels as number,
      flows: opts.flows !== false,
      rootScope: opts.rootScope as string | undefined,
      output: opts.output as string | undefined,
      port: opts.port as number | undefined,
      open: opts.open !== false,
      serve: opts.serve !== false,
      concurrency: opts.concurrency as number,
      maxBudgetUsd: opts.maxBudgetUsd as number | undefined,
      cache: opts.cache !== false,
      dryRun: !!opts.dryRun,
      bare: !!opts.bare,
      twoStage: !!opts.twoStage,
      model: opts.model as string | undefined,
      verbose: !!opts.verbose,
      quiet: !!opts.quiet,
    });
    process.exit(code);
  });

program
  .command('serve')
  .description('Re-open an existing analysis in the browser (no regeneration)')
  .argument('[path]', 'Path to the codebase whose .viszi/ should be served', '.')
  .option('--output <dir>', 'Output directory (default: <path>/.viszi)')
  .option('--port <n>', 'Server port (default: auto)', parseIntStrict('port'))
  .option('--no-open', "Don't auto-open the browser")
  .option('-v, --verbose', 'Verbose logging')
  .option('-q, --quiet', 'Errors only')
  .action(async (path: string, opts: Record<string, unknown>) => {
    const code = await runServeCommand({
      path,
      output: opts.output as string | undefined,
      port: opts.port as number | undefined,
      open: opts.open !== false,
      verbose: !!opts.verbose,
      quiet: !!opts.quiet,
    });
    process.exit(code);
  });

program
  .command('clear')
  .description('Remove the .viszi/ output directory for a path')
  .argument('[path]', 'Path whose .viszi/ should be removed', '.')
  .option('--output <dir>', 'Output directory (default: <path>/.viszi)')
  .option('-q, --quiet', 'Errors only')
  .action(async (path: string, opts: Record<string, unknown>) => {
    const code = await runClearCommand({
      path,
      output: opts.output as string | undefined,
      quiet: !!opts.quiet,
    });
    process.exit(code);
  });

program
  .command('init')
  .description('Write a starter .viszi.json (and optional .viszi-ignore) to a path')
  .argument('[path]', 'Directory to write the config into', '.')
  .option('--force', 'Overwrite an existing .viszi.json / .viszi-ignore')
  .option('--with-ignore', 'Also write a .viszi-ignore template alongside the config')
  .option('-v, --verbose', 'Verbose logging')
  .option('-q, --quiet', 'Errors only')
  .action(async (path: string, opts: Record<string, unknown>) => {
    const code = await runInitCommand({
      path,
      force: !!opts.force,
      withIgnore: !!opts.withIgnore,
      verbose: !!opts.verbose,
      quiet: !!opts.quiet,
    });
    process.exit(code);
  });

program
  .command('export')
  .description('Export an existing analysis to a single self-contained HTML file')
  .argument('[path]', 'Path whose analysis should be exported', '.')
  .option('--output <dir>', 'Input analysis directory (default: <path>/.viszi)')
  .option('--out <file>', 'Output HTML path (default: <name>-viszi.html in cwd)')
  .option('-v, --verbose', 'Verbose logging')
  .option('-q, --quiet', 'Errors only')
  .action(async (path: string, opts: Record<string, unknown>) => {
    const code = await runExportCommand({
      path,
      output: opts.output as string | undefined,
      out: opts.out as string | undefined,
      verbose: !!opts.verbose,
      quiet: !!opts.quiet,
    });
    process.exit(code);
  });

program
  .command('regen')
  .description('Invalidate one diagram\'s cache entry + re-run only that AI call (existing cache makes the rest free)')
  .argument('<diagram-id>', 'Id of the diagram to regenerate (see `id` in any diagram JSON or the URL)')
  .argument('[path]', 'Repo path (default: cwd)', '.')
  .option('--output <dir>', 'Output directory (default: <path>/.viszi)')
  .option('-v, --verbose', 'Verbose logging')
  .option('-q, --quiet', 'Errors only')
  .action(async (diagramId: string, path: string, opts: Record<string, unknown>) => {
    const code = await runRegenCommand({
      diagramId,
      path,
      output: opts.output as string | undefined,
      verbose: !!opts.verbose,
      quiet: !!opts.quiet,
    });
    process.exit(code);
  });

program.addHelpText(
  'after',
  `\nExamples:
  ${k.cyan('viszi .')}                     Analyse the current directory (levels=2)
  ${k.cyan('viszi ./monorepo --levels 3')}  Three tiers deep
  ${k.cyan('viszi . --root-scope src/app')} Start the L1 diagram inside src/app/
  ${k.cyan('viszi . --no-flows')}           Skip flow diagrams
  ${k.cyan('viszi . --two-stage')}          Higher-quality output: prose narrative → structured call (2× AI calls)
  ${k.cyan('viszi . --dry-run')}            Generate stub diagrams without calling Claude
  ${k.cyan('viszi serve .')}                Re-open an existing analysis
  ${k.cyan('viszi regen sys__src_auth__L2 .')} Re-run one AI call (cache makes the rest free)
  ${k.cyan('viszi init .')}                 Write a starter .viszi.json with every field documented
`,
);

program.parseAsync(process.argv).catch((err) => {
  console.error(k.red('viszi: ') + (err as Error).message);
  process.exit(1);
});
