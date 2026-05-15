import { Command, Option } from 'commander';
import { runAnalyzeCommand } from './commands/analyze.js';
import { runServeCommand } from './commands/serve.js';
import { runClearCommand } from './commands/clear.js';
import { runExportCommand } from './commands/export.js';
import { viszVersion } from '../shared/version.js';
import { k } from './logger.js';

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
  .option('--output <dir>', 'Output directory (default: <path>/.viszi)')
  .option('--port <n>', 'Server port (default: auto)', parseIntStrict('port'))
  .option('--no-open', "Don't auto-open the browser")
  .option('--no-serve', 'Generate only — do not start the server')
  .option('--concurrency <n>', 'Parallel Claude calls', parseIntStrict('concurrency'), 4)
  .option('--max-budget-usd <amount>', 'Per-call USD budget', parseFloatStrict('max-budget-usd'), 0.5)
  .option('--no-cache', 'Disable response cache')
  .option('--dry-run', 'Skip Claude calls; emit synthetic diagrams (offline)')
  .option('--bare', 'Run Claude in --bare mode (skip hooks/MCP/CLAUDE.md)', true)
  .option('--no-bare', 'Run Claude with the user\'s full environment')
  .addOption(new Option('--model <name>', 'Claude model alias or full id (e.g. opus, sonnet)'))
  .option('-v, --verbose', 'Verbose logging')
  .option('-q, --quiet', 'Errors only')
  .action(async (path: string, opts: Record<string, unknown>) => {
    const code = await runAnalyzeCommand({
      path,
      levels: opts.levels as number,
      flows: opts.flows !== false,
      output: opts.output as string | undefined,
      port: opts.port as number | undefined,
      open: opts.open !== false,
      serve: opts.serve !== false,
      concurrency: opts.concurrency as number,
      maxBudgetUsd: opts.maxBudgetUsd as number,
      cache: opts.cache !== false,
      dryRun: !!opts.dryRun,
      bare: opts.bare !== false,
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

program.addHelpText(
  'after',
  `\nExamples:
  ${k.cyan('viszi .')}                     Analyse the current directory (levels=2)
  ${k.cyan('viszi ./monorepo --levels 3')}  Three tiers deep
  ${k.cyan('viszi . --no-flows')}           Skip flow diagrams
  ${k.cyan('viszi . --dry-run')}            Generate stub diagrams without calling Claude
  ${k.cyan('viszi serve .')}                Re-open an existing analysis
`,
);

program.parseAsync(process.argv).catch((err) => {
  console.error(k.red('viszi: ') + (err as Error).message);
  process.exit(1);
});
