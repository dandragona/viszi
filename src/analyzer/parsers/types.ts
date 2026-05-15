import type { Language } from '../languages.js';

export interface ImportRef {
  raw: string;
  resolved?: string;
  kind: 'import' | 'require' | 'from' | 'dynamic';
  /** The local names this import binds (e.g. `a`, `b` from `import { a, b } from 'x'`). */
  boundNames?: string[];
}

export interface CallsiteRef {
  /** The name being called (the local identifier). */
  callee: string;
  /** If the callee maps to an import, the raw import specifier it came from. */
  fromImport?: string;
  line: number;
}

export interface SymbolRef {
  name: string;
  kind: 'function' | 'class' | 'const' | 'type' | 'interface' | 'export';
  exported: boolean;
  line: number;
}

export interface HandlerRef {
  method?: string;
  path?: string;
  handler?: string;
  line: number;
  framework?: string;
}

export interface CommandRef {
  name: string;
  description?: string;
  line: number;
  framework?: string;
}

export interface ParsedFile {
  abs: string;
  rel: string;
  language: Language;
  imports: ImportRef[];
  symbols: SymbolRef[];
  httpHandlers: HandlerRef[];
  cliCommands: CommandRef[];
  callsites: CallsiteRef[];
  loc: number;
}

export interface LanguageParser {
  language: Language | Language[];
  parse(absPath: string, relPath: string, source: string): ParsedFile;
}
