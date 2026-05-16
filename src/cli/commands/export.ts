import { existsSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import {
  absolutize,
  defaultOutputDir,
  diagramsSubdir,
  indexFile,
  webDistDir,
} from '../../shared/paths.js';
import { Logger, k } from '../logger.js';
import { viszVersion } from '../../shared/version.js';

export interface ExportArgs {
  path?: string;
  output?: string;
  out?: string;
  quiet?: boolean;
  verbose?: boolean;
}

export async function runExportCommand(args: ExportArgs): Promise<number> {
  const verbosity = args.quiet ? 'quiet' : args.verbose ? 'verbose' : 'normal';
  const log = new Logger(verbosity);
  const repoRoot = absolutize(args.path ?? process.cwd());
  const outputDir = args.output ? absolutize(args.output, repoRoot) : defaultOutputDir(repoRoot);

  if (!existsSync(indexFile(outputDir))) {
    log.error(`No analysis found at ${outputDir}. Run \`viszi ${repoRoot}\` first.`);
    return 1;
  }
  const distDir = webDistDir();
  if (!existsSync(distDir) || !existsSync(resolve(distDir, 'assets'))) {
    log.error(`Web bundle not found at ${distDir}. The viszi install is incomplete; reinstall.`);
    return 1;
  }

  // Find the bundled CSS + JS produced by Vite.
  const assetsDir = resolve(distDir, 'assets');
  const assetFiles = readdirSync(assetsDir);
  const jsFile = assetFiles.find((f) => f.endsWith('.js'));
  const cssFile = assetFiles.find((f) => f.endsWith('.css'));
  if (!jsFile || !cssFile) {
    log.error('Could not find built JS/CSS bundle in dist/web/assets/.');
    return 1;
  }
  const js = readFileSync(resolve(assetsDir, jsFile), 'utf8');
  const css = readFileSync(resolve(assetsDir, cssFile), 'utf8');

  // Read the analysis JSON.
  log.info('Loading diagrams…');
  const index = JSON.parse(readFileSync(indexFile(outputDir), 'utf8'));
  const diagramsDir = diagramsSubdir(outputDir);
  const diagrams: Record<string, unknown> = {};
  let diagramBytes = 0;
  for (const f of readdirSync(diagramsDir)) {
    if (!f.endsWith('.json')) continue;
    const id = f.replace(/\.json$/, '');
    const text = readFileSync(resolve(diagramsDir, f), 'utf8');
    diagramBytes += text.length;
    diagrams[id] = JSON.parse(text);
  }

  // Optional search index — present if the writer emitted one.
  const searchPath = resolve(outputDir, 'search.json');
  const search = existsSync(searchPath) ? JSON.parse(readFileSync(searchPath, 'utf8')) : undefined;

  const data = { index, diagrams, search };

  const repoLabel = basename(repoRoot);
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark light" />
  <meta name="generator" content="viszi ${viszVersion()}" />
  <title>viszi · ${escapeHtml(repoLabel)}</title>
  <style>${css}</style>
</head>
<body>
  <div id="root"></div>
  <script>window.__VISZI_DATA__ = ${jsonForScript(data)};</script>
  <script type="module">${js}</script>
</body>
</html>
`;

  const outPath = args.out
    ? absolutize(args.out, process.cwd())
    : resolve(process.cwd(), `${repoLabel}-viszi.html`);
  writeFileSync(outPath, html, 'utf8');
  const sizeKb = (statSync(outPath).size / 1024).toFixed(0);
  log.success(
    `Wrote ${k.cyan(outPath)} (${sizeKb} KB · ${Object.keys(diagrams).length} diagrams · ${(diagramBytes / 1024).toFixed(0)} KB inlined data)`,
  );
  return 0;
}

/**
 * JSON-encode for embedding in a <script> tag.
 * Escape `</` so a stray `</script` inside string values can't terminate the tag.
 * Exported for unit tests.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/<\/(script|style)/gi, '<\\/$1');
}

/** Escape user-controlled text for HTML attribute / text contexts. Exported for unit tests. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
