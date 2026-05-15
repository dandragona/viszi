import type { Language } from '../languages.js';
import type { LanguageParser, ParsedFile, ImportRef, SymbolRef, HandlerRef } from './types.js';

const SINGLE_IMPORT_RE = /^\s*import\s+"([^"]+)"/gm;
const MULTI_IMPORT_RE = /import\s*\(\s*([^)]+)\)/g;
const QUOTED_RE = /"([^"]+)"/g;
const FUNC_RE = /^\s*func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/gm;
const TYPE_RE = /^\s*type\s+(\w+)\s+(?:struct|interface)/gm;
const HTTP_FUNC_RE = /\bhttp\.HandleFunc\(\s*"([^"]+)"/g;
const MUX_RE = /\b(?:mux|router|r|app)\.(?:HandleFunc|Handle|Get|Post|Put|Delete|Patch)\(\s*"([^"]+)"/g;

function lineOf(source: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < source.length; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

export class GoParser implements LanguageParser {
  readonly language: Language = 'go';

  parse(absPath: string, relPath: string, source: string): ParsedFile {
    const imports: ImportRef[] = [];
    const symbols: SymbolRef[] = [];
    const handlers: HandlerRef[] = [];

    for (const m of source.matchAll(SINGLE_IMPORT_RE)) {
      imports.push({ raw: m[1], kind: 'import' });
    }
    for (const block of source.matchAll(MULTI_IMPORT_RE)) {
      for (const q of block[1].matchAll(QUOTED_RE)) {
        imports.push({ raw: q[1], kind: 'import' });
      }
    }
    for (const m of source.matchAll(FUNC_RE)) {
      const exported = /^[A-Z]/.test(m[1]);
      symbols.push({ name: m[1], kind: 'function', exported, line: lineOf(source, m.index ?? 0) });
    }
    for (const m of source.matchAll(TYPE_RE)) {
      const exported = /^[A-Z]/.test(m[1]);
      symbols.push({ name: m[1], kind: 'type', exported, line: lineOf(source, m.index ?? 0) });
    }
    for (const m of source.matchAll(HTTP_FUNC_RE)) {
      handlers.push({ path: m[1], line: lineOf(source, m.index ?? 0), framework: 'net/http' });
    }
    for (const m of source.matchAll(MUX_RE)) {
      handlers.push({ path: m[1], line: lineOf(source, m.index ?? 0), framework: 'mux/chi' });
    }

    return {
      abs: absPath,
      rel: relPath,
      language: 'go',
      imports,
      symbols,
      httpHandlers: handlers,
      cliCommands: [],
      callsites: [],
      loc: source.split('\n').length,
    };
  }
}
