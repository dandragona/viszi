import type { Language } from '../languages.js';
import type { LanguageParser, ParsedFile, ImportRef, SymbolRef, HandlerRef, CallsiteRef } from './types.js';

const IMPORT_RE = /^\s*import\s+([\w*{}\s,]+)\s+from\s+['"]([^'"]+)['"]/gm;
const SIDE_EFFECT_IMPORT_RE = /^\s*import\s+['"]([^'"]+)['"]/gm;
const REQUIRE_RE = /(?:const|let|var)\s+([\w{},\s:]+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
const REQUIRE_BARE_RE = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
const DYNAMIC_IMPORT_RE = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
const EXPORT_FN_RE = /^\s*export\s+(?:async\s+)?function\s+(\w+)/gm;
const EXPORT_CLASS_RE = /^\s*export\s+(?:default\s+)?class\s+(\w+)/gm;
const EXPORT_CONST_RE = /^\s*export\s+(?:const|let|var)\s+(\w+)/gm;
const EXPORT_TYPE_RE = /^\s*export\s+(?:type|interface)\s+(\w+)/gm;
const TOP_FN_RE = /^\s*(?:async\s+)?function\s+(\w+)/gm;
const TOP_CLASS_RE = /^\s*class\s+(\w+)/gm;

const HTTP_RE =
  /\b(?:app|router|server|fastify|hono)\.(get|post|put|patch|delete|all|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
const FASTIFY_ROUTE_RE = /\.route\(\s*\{\s*method\s*:\s*['"](\w+)['"]\s*,\s*url\s*:\s*['"]([^'"]+)['"]/gi;
const NEXT_HANDLER_RE = /\bexport\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*\(/g;

// JS reserved-word-ish callees that are never user functions (filter noise).
const CALL_NOISE = new Set([
  'if', 'for', 'while', 'switch', 'return', 'throw', 'await', 'yield', 'typeof',
  'instanceof', 'new', 'delete', 'void', 'in', 'of', 'do', 'with', 'this', 'super',
  'console', 'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Date',
  'JSON', 'Math', 'Symbol', 'Error', 'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'String', 'Boolean',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'require', 'import', 'expect', 'describe', 'it', 'test', 'beforeEach', 'afterEach',
]);

function lineOf(source: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < source.length; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

function pushUnique<T extends { name?: string; raw?: string }>(arr: T[], item: T, key: keyof T) {
  const k = item[key];
  if (!arr.some((x) => x[key] === k)) arr.push(item);
}

/**
 * Parse the names brought into scope by an `import { a, b as c, d } from 'x'`-style
 * specifier, plus default and namespace forms. Best-effort regex.
 */
function extractBoundNames(specifier: string): string[] {
  const out: string[] = [];
  // namespace: `* as name`
  const ns = specifier.match(/\*\s+as\s+(\w+)/);
  if (ns) out.push(ns[1]);
  // default import: `Name` at the very start (no braces)
  const defaultMatch = specifier.match(/^\s*(\w+)\s*(?:,|$)/);
  if (defaultMatch && !defaultMatch[0].includes('{')) out.push(defaultMatch[1]);
  // named imports inside braces
  const braces = specifier.match(/\{([^}]*)\}/);
  if (braces) {
    for (const piece of braces[1].split(',')) {
      const trimmed = piece.trim();
      if (!trimmed) continue;
      const aliased = trimmed.match(/^(\w+)\s+as\s+(\w+)/);
      if (aliased) out.push(aliased[2]);
      else {
        const plain = trimmed.match(/^(\w+)/);
        if (plain) out.push(plain[1]);
      }
    }
  }
  return out;
}

export class JsLikeParser implements LanguageParser {
  readonly language: Language[] = ['typescript', 'tsx', 'javascript', 'jsx'];

  parse(absPath: string, relPath: string, source: string): ParsedFile {
    const imports: ImportRef[] = [];
    const symbols: SymbolRef[] = [];
    const handlers: HandlerRef[] = [];
    const callsites: CallsiteRef[] = [];

    // Imports — capture bound names alongside the specifier.
    for (const m of source.matchAll(IMPORT_RE)) {
      const names = extractBoundNames(m[1]);
      pushUnique(imports, { raw: m[2], kind: 'import', boundNames: names }, 'raw');
    }
    for (const m of source.matchAll(SIDE_EFFECT_IMPORT_RE)) {
      pushUnique(imports, { raw: m[1], kind: 'import', boundNames: [] }, 'raw');
    }
    for (const m of source.matchAll(REQUIRE_RE)) {
      const names = extractBoundNames(m[1]);
      pushUnique(imports, { raw: m[2], kind: 'require', boundNames: names }, 'raw');
    }
    // Bare requires (e.g. inside an expression) — record without bound names.
    for (const m of source.matchAll(REQUIRE_BARE_RE)) {
      pushUnique(imports, { raw: m[1], kind: 'require', boundNames: [] }, 'raw');
    }
    for (const m of source.matchAll(DYNAMIC_IMPORT_RE)) {
      pushUnique(imports, { raw: m[1], kind: 'dynamic', boundNames: [] }, 'raw');
    }

    const collectSyms = (re: RegExp, kind: SymbolRef['kind'], exported: boolean) => {
      for (const m of source.matchAll(re)) {
        symbols.push({
          name: m[1],
          kind,
          exported,
          line: lineOf(source, m.index ?? 0),
        });
      }
    };
    collectSyms(EXPORT_FN_RE, 'function', true);
    collectSyms(EXPORT_CLASS_RE, 'class', true);
    collectSyms(EXPORT_CONST_RE, 'const', true);
    collectSyms(EXPORT_TYPE_RE, 'type', true);
    collectSyms(TOP_FN_RE, 'function', false);
    collectSyms(TOP_CLASS_RE, 'class', false);

    for (const m of source.matchAll(HTTP_RE)) {
      handlers.push({
        method: m[1].toUpperCase(),
        path: m[2],
        line: lineOf(source, m.index ?? 0),
        framework: 'express-like',
      });
    }
    for (const m of source.matchAll(FASTIFY_ROUTE_RE)) {
      handlers.push({
        method: m[1].toUpperCase(),
        path: m[2],
        line: lineOf(source, m.index ?? 0),
        framework: 'fastify',
      });
    }
    for (const m of source.matchAll(NEXT_HANDLER_RE)) {
      handlers.push({
        method: m[1].toUpperCase(),
        path: relPath,
        line: lineOf(source, m.index ?? 0),
        framework: 'next-route',
      });
    }

    // Callsites — find `name(` occurrences whose name is an imported binding.
    // We deliberately ignore intra-file calls; they're not architecture-relevant
    // for the module-level diagram.
    const importedFrom = new Map<string, string>();
    for (const imp of imports) {
      for (const name of imp.boundNames ?? []) {
        if (!importedFrom.has(name)) importedFrom.set(name, imp.raw);
      }
    }
    if (importedFrom.size > 0) {
      const seen = new Set<string>();
      const callRe = /\b([A-Za-z_$][\w$]*)\s*\(/g;
      for (const m of source.matchAll(callRe)) {
        const name = m[1];
        if (CALL_NOISE.has(name)) continue;
        const from = importedFrom.get(name);
        if (!from) continue;
        const key = `${name}|${from}`;
        if (seen.has(key)) continue;
        seen.add(key);
        callsites.push({
          callee: name,
          fromImport: from,
          line: lineOf(source, m.index ?? 0),
        });
      }
    }

    return {
      abs: absPath,
      rel: relPath,
      language: 'typescript',
      imports,
      symbols,
      httpHandlers: handlers,
      cliCommands: [],
      callsites,
      loc: source.split('\n').length,
    };
  }
}
