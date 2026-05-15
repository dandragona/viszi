import type { Language } from '../languages.js';
import type { LanguageParser, ParsedFile, ImportRef, SymbolRef, HandlerRef } from './types.js';

const FROM_IMPORT_RE = /^\s*from\s+([\w.]+)\s+import\s+/gm;
const IMPORT_RE = /^\s*import\s+([\w.]+)/gm;
const DEF_RE = /^\s*(async\s+)?def\s+(\w+)/gm;
const CLASS_RE = /^\s*class\s+(\w+)/gm;
const FLASK_RE = /@(?:app|blueprint|bp)\.route\(\s*['"]([^'"]+)['"](?:[^)]*methods\s*=\s*\[([^\]]+)\])?/gi;
const FASTAPI_RE = /@(?:app|router)\.(get|post|put|patch|delete|options|head)\(\s*['"]([^'"]+)['"]/gi;
const DJANGO_RE = /\bpath\(\s*['"]([^'"]+)['"]\s*,\s*([\w.]+)/g;

function lineOf(source: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < source.length; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

export class PythonParser implements LanguageParser {
  readonly language: Language = 'python';

  parse(absPath: string, relPath: string, source: string): ParsedFile {
    const imports: ImportRef[] = [];
    const symbols: SymbolRef[] = [];
    const handlers: HandlerRef[] = [];

    for (const m of source.matchAll(FROM_IMPORT_RE)) {
      imports.push({ raw: m[1], kind: 'from' });
    }
    for (const m of source.matchAll(IMPORT_RE)) {
      imports.push({ raw: m[1], kind: 'import' });
    }
    for (const m of source.matchAll(DEF_RE)) {
      symbols.push({ name: m[2], kind: 'function', exported: true, line: lineOf(source, m.index ?? 0) });
    }
    for (const m of source.matchAll(CLASS_RE)) {
      symbols.push({ name: m[1], kind: 'class', exported: true, line: lineOf(source, m.index ?? 0) });
    }
    for (const m of source.matchAll(FLASK_RE)) {
      handlers.push({
        method: m[2] ? m[2].split(',')[0].replace(/['"\s]/g, '').toUpperCase() : 'GET',
        path: m[1],
        line: lineOf(source, m.index ?? 0),
        framework: 'flask',
      });
    }
    for (const m of source.matchAll(FASTAPI_RE)) {
      handlers.push({
        method: m[1].toUpperCase(),
        path: m[2],
        line: lineOf(source, m.index ?? 0),
        framework: 'fastapi',
      });
    }
    for (const m of source.matchAll(DJANGO_RE)) {
      handlers.push({
        method: 'GET',
        path: m[1],
        handler: m[2],
        line: lineOf(source, m.index ?? 0),
        framework: 'django',
      });
    }

    return {
      abs: absPath,
      rel: relPath,
      language: 'python',
      imports,
      symbols,
      httpHandlers: handlers,
      cliCommands: [],
      callsites: [],
      loc: source.split('\n').length,
    };
  }
}
