import { existsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve, join } from 'node:path';
import type { Language } from './languages.js';

const JS_EXTS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.d.ts'];
const PY_EXTS = ['.py'];
const GO_EXTS = ['.go'];

function tryFile(base: string, exts: string[]): string | undefined {
  if (existsSync(base)) {
    try {
      if (statSync(base).isFile()) return base;
    } catch {
      /* ignore */
    }
  }
  for (const ext of exts) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }
  for (const ext of exts) {
    const candidate = join(base, 'index' + ext);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Best-effort resolution of an `import` reference to an absolute file path
 * inside `repoRoot`. Returns undefined for external (npm/pip/go module) imports.
 */
export function resolveImport(opts: {
  raw: string;
  fromFile: string;
  repoRoot: string;
  language: Language;
}): string | undefined {
  const { raw, fromFile, repoRoot, language } = opts;
  if (!raw) return undefined;

  if (raw.startsWith('.') || raw.startsWith('/') || isAbsolute(raw)) {
    const base = isAbsolute(raw) ? raw : resolve(dirname(fromFile), raw);
    if (language === 'python') return tryFile(base, PY_EXTS);
    if (language === 'go') return tryFile(base, GO_EXTS);
    return tryFile(base, JS_EXTS);
  }

  // Python dotted: `package.subpackage.module` → repo/package/subpackage/module.py
  if (language === 'python' && /^[a-z_][\w.]*$/i.test(raw)) {
    const candidate = join(repoRoot, raw.replace(/\./g, '/'));
    return tryFile(candidate, PY_EXTS);
  }

  // Go imports usually look like `github.com/user/repo/pkg`. Treat the last
  // segment as a candidate inside the repo (works for monorepo-style code).
  if (language === 'go') {
    const seg = raw.split('/').slice(-2).join('/');
    const candidate = join(repoRoot, seg);
    return tryFile(candidate, GO_EXTS);
  }

  // JS path-aliases (`@/foo`, `~/foo`, `src/foo`) — naive: try repoRoot-relative.
  if (language === 'typescript' || language === 'tsx' || language === 'javascript' || language === 'jsx') {
    const stripped = raw.replace(/^[@~]\//, '').replace(/^src\//, 'src/');
    const candidate = resolve(repoRoot, stripped);
    return tryFile(candidate, JS_EXTS);
  }

  return undefined;
}
