import { readFileSync, statSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { globby } from 'globby';
import ignoreLib from 'ignore';
import { detectLanguage, type Language } from './languages.js';

// `ignore` is a CJS module whose default export is a factory function.
// NodeNext sometimes types the import as a namespace; runtime resolves to the function.
type IgnoreFn = () => { add(p: string): IgnoreFnResult; ignores(p: string): boolean };
type IgnoreFnResult = ReturnType<IgnoreFn>;
const ignore = ignoreLib as unknown as IgnoreFn;

const ALWAYS_EXCLUDE = [
  'node_modules/**',
  '.git/**',
  '.jj/**',
  '.hg/**',
  '.svn/**',
  '.viszi/**',
  '.next/**',
  '.nuxt/**',
  '.cache/**',
  '.parcel-cache/**',
  '.turbo/**',
  '.vercel/**',
  '.svelte-kit/**',
  'dist/**',
  'build/**',
  'out/**',
  'target/**',
  '.venv/**',
  'venv/**',
  '__pycache__/**',
  '.pytest_cache/**',
  '.mypy_cache/**',
  '.tox/**',
  'vendor/**',
  '.gradle/**',
  '.idea/**',
  '.vscode/**',
  'coverage/**',
];

const MAX_FILE_BYTES = 1_000_000;

export interface DiscoveredFile {
  abs: string;
  rel: string;
  language: Language;
  size: number;
}

export interface TraverseOpts {
  root: string;
  scope?: string;
  honorGitignore?: boolean;
  extraExcludes?: string[];
  includeOnly?: string[];
}

export async function traverse(opts: TraverseOpts): Promise<DiscoveredFile[]> {
  const root = resolve(opts.root);
  const scopeAbs = opts.scope ? resolve(root, opts.scope) : root;

  const ig = ignore();
  if (opts.honorGitignore !== false) {
    for (const candidate of ['.gitignore', '.viszi-ignore']) {
      try {
        ig.add(readFileSync(join(root, candidate), 'utf8'));
      } catch {
        // not present, fine
      }
    }
  }

  const patterns = opts.includeOnly?.length ? opts.includeOnly : ['**/*'];
  const ignorePatterns = [...ALWAYS_EXCLUDE, ...(opts.extraExcludes ?? [])];

  const matches = await globby(patterns, {
    cwd: scopeAbs,
    ignore: ignorePatterns,
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
    absolute: true,
  });

  const out: DiscoveredFile[] = [];
  for (const abs of matches) {
    const rel = relative(root, abs);
    if (ig.ignores(rel)) continue;
    let size: number;
    try {
      size = statSync(abs).size;
    } catch {
      continue;
    }
    if (size > MAX_FILE_BYTES) continue;
    out.push({
      abs,
      rel,
      language: detectLanguage(abs),
      size,
    });
  }
  return out;
}
