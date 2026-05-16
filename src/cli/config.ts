import { cosmiconfig, type Loader } from 'cosmiconfig';
import type { VisziConfig } from '../ai/orchestrator.js';

/**
 * Strip `// line` and `/* block *\/` comments from a JSON document, while
 * preserving them when they appear inside string literals. Used so `viszi
 * init` can ship a richly commented `.viszi.json` that still parses.
 */
export function stripJsonComments(input: string): string {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];
    if (inString) {
      out += ch;
      if (ch === '\\' && next !== undefined) {
        out += next;
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < input.length && input[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < input.length - 1 && !(input[i] === '*' && input[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

const jsonLoader: Loader = (_filepath, content) => {
  return JSON.parse(stripJsonComments(content));
};

const explorer = cosmiconfig('viszi', {
  searchPlaces: [
    'package.json',
    '.viszirc',
    '.viszirc.json',
    '.viszi.json',
    'viszi.config.json',
    'viszi.config.js',
  ],
  loaders: {
    '.json': jsonLoader,
    '.viszirc': jsonLoader,
    noExt: jsonLoader,
  },
});

export async function loadConfig(searchFrom: string): Promise<VisziConfig | undefined> {
  const result = await explorer.search(searchFrom);
  if (!result) return undefined;
  return result.config as VisziConfig;
}
