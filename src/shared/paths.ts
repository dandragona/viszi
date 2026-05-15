import { createHash } from 'node:crypto';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));

/** Root of the installed viszi package (one level above `dist/`). */
export function packageRoot(): string {
  return resolve(here, '../..');
}

/** Where the built React SPA is. */
export function webDistDir(): string {
  return resolve(packageRoot(), 'dist/web');
}

/** Where bundled tree-sitter WASM grammars live. */
export function grammarsDir(): string {
  return resolve(packageRoot(), 'grammars');
}

export function ensureDir(p: string): string {
  mkdirSync(p, { recursive: true });
  return p;
}

export function absolutize(target: string, cwd: string = process.cwd()): string {
  return isAbsolute(target) ? target : resolve(cwd, target);
}

export function defaultOutputDir(repoRoot: string): string {
  return resolve(repoRoot, '.viszi');
}

export function diagramsSubdir(outputDir: string): string {
  return resolve(outputDir, 'diagrams');
}

export function cacheSubdir(outputDir: string): string {
  return resolve(outputDir, 'cache');
}

export function indexFile(outputDir: string): string {
  return resolve(outputDir, 'index.json');
}

export function metaFile(outputDir: string): string {
  return resolve(outputDir, 'meta.json');
}

/** Stable file-system-safe id for a diagram filename. */
export function sanitizeId(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200);
}

/** Hash a string to a short hex slug — used for cache keys + node ids. */
export function shortHash(input: string, length = 12): string {
  return createHash('sha256').update(input).digest('hex').slice(0, length);
}
