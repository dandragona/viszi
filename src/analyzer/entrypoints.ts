import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ParsedFile } from './parsers/index.js';

export interface Entrypoint {
  kind: 'http' | 'cli' | 'cron' | 'event' | 'init' | 'package-main' | 'package-bin';
  file: string;
  description: string;
  detail?: string;
}

const PACKAGE_JSON_FIELDS = ['main', 'module', 'types', 'bin', 'exports'] as const;

export function detectEntrypoints(opts: {
  repoRoot: string;
  parsed: ParsedFile[];
}): Entrypoint[] {
  const { repoRoot, parsed } = opts;
  const out: Entrypoint[] = [];

  // package.json hints
  const pkgPath = join(repoRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      for (const field of PACKAGE_JSON_FIELDS) {
        const v = pkg[field];
        if (typeof v === 'string') {
          out.push({
            kind: field === 'bin' ? 'package-bin' : 'package-main',
            file: v.replace(/^\.\//, ''),
            description: `package.json ${field}`,
          });
        } else if (v && typeof v === 'object') {
          for (const [k, target] of Object.entries(v as Record<string, unknown>)) {
            if (typeof target === 'string') {
              out.push({
                kind: field === 'bin' ? 'package-bin' : 'package-main',
                file: target.replace(/^\.\//, ''),
                description: `package.json ${field}.${k}`,
              });
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  // pyproject.toml scripts (best-effort, no toml parser dep)
  const pyproject = join(repoRoot, 'pyproject.toml');
  if (existsSync(pyproject)) {
    try {
      const text = readFileSync(pyproject, 'utf8');
      const scripts = text.match(/\[project\.scripts\]([\s\S]*?)(?:\n\[|$)/);
      if (scripts) {
        for (const m of scripts[1].matchAll(/^\s*(\w+)\s*=\s*"([^"]+)"/gm)) {
          out.push({
            kind: 'cli',
            file: relative(repoRoot, join(repoRoot, m[2].split(':')[0].replace(/\./g, '/') + '.py')),
            description: `pyproject script: ${m[1]}`,
            detail: m[2],
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  // HTTP handlers found by parsers
  for (const p of parsed) {
    for (const h of p.httpHandlers) {
      out.push({
        kind: 'http',
        file: p.rel,
        description: `${h.method ?? 'ANY'} ${h.path ?? p.rel}`,
        detail: h.framework,
      });
    }
  }

  // Heuristic CLI / job detection by filename
  for (const p of parsed) {
    const lower = p.rel.toLowerCase();
    if (/(?:^|\/)(main|cli|index|server|app)\.(?:ts|tsx|js|mjs|py|go)$/.test(lower)) {
      out.push({
        kind: 'init',
        file: p.rel,
        description: `Likely entrypoint by name`,
      });
    }
    if (/cron|scheduler|worker|consumer|job|queue/.test(lower)) {
      out.push({
        kind: 'cron',
        file: p.rel,
        description: `Likely background worker by name`,
      });
    }
    if (/listener|handler|subscribe|on_event|hook/.test(lower)) {
      out.push({
        kind: 'event',
        file: p.rel,
        description: `Likely event handler by name`,
      });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return out.filter((e) => {
    const key = `${e.kind}|${e.file}|${e.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
