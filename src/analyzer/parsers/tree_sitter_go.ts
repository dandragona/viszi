import type { Language } from '../languages.js';
import type {
  CallsiteRef,
  HandlerRef,
  ImportRef,
  LanguageParser,
  ParsedFile,
  SymbolRef,
} from './types.js';
import { newParser } from './tree_sitter_base.js';
import type Parser from 'web-tree-sitter';

const IMPORT_QUERY = `
  (import_declaration (import_spec path: (interpreted_string_literal) @path))
  (import_declaration (import_spec_list (import_spec path: (interpreted_string_literal) @path)))
`;

const SYMBOL_QUERY = `
  (source_file (function_declaration name: (identifier) @fn))
  (source_file (method_declaration name: (field_identifier) @method))
  (source_file (type_declaration (type_spec name: (type_identifier) @ty)))
  (source_file (const_declaration (const_spec name: (identifier) @const)))
  (source_file (var_declaration (var_spec name: (identifier) @var)))
`;

const CALL_QUERY = `
  (call_expression function: (identifier) @callee)
  (call_expression function: (selector_expression field: (field_identifier) @callee))
`;

// HTTP routing — net/http and the common chi/gin/mux idioms all share the shape
// receiver.METHOD("/path", handler). The receiver name varies (r, mux, app, router, ...).
const HANDLER_QUERY = `
  (call_expression
    function: (selector_expression
      operand: (identifier) @recv
      field: (field_identifier) @method)
    arguments: (argument_list . (interpreted_string_literal) @path))
`;

const HANDLER_METHODS = new Set([
  'HandleFunc',
  'Handle',
  'Get',
  'GET',
  'Post',
  'POST',
  'Put',
  'PUT',
  'Delete',
  'DELETE',
  'Patch',
  'PATCH',
  'Options',
  'OPTIONS',
  'Head',
  'HEAD',
]);

const ROUTING_RECEIVERS = new Set(['http', 'mux', 'router', 'r', 'app', 'e', 'g']);

function stripQuotes(text: string): string {
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('`') && text.endsWith('`'))) {
    return text.slice(1, -1);
  }
  return text;
}

function isExported(name: string): boolean {
  return /^[A-Z]/.test(name);
}

let cachedParser: Parser | null = null;
function getParser(): Parser {
  if (!cachedParser) cachedParser = newParser('go');
  return cachedParser;
}

export class GoTreeSitterParser implements LanguageParser {
  readonly language: Language = 'go';

  parse(absPath: string, relPath: string, source: string): ParsedFile {
    const parser = getParser();
    const tree = parser.parse(source);
    if (!tree) return emptyParsed(absPath, relPath, source);
    const lang = parser.getLanguage();

    const imports: ImportRef[] = [];
    const symbols: SymbolRef[] = [];
    const callsites: CallsiteRef[] = [];
    const httpHandlers: HandlerRef[] = [];

    // ── Imports ────────────────────────────────────────────────────────
    const importQ = lang.query(IMPORT_QUERY);
    for (const cap of importQ.captures(tree.rootNode)) {
      const raw = stripQuotes(cap.node.text);
      imports.push({ raw, kind: 'import' });
    }
    importQ.delete();

    // ── Top-level symbols ──────────────────────────────────────────────
    const symbolQ = lang.query(SYMBOL_QUERY);
    for (const cap of symbolQ.captures(tree.rootNode)) {
      const name = cap.node.text;
      const kind: SymbolRef['kind'] =
        cap.name === 'fn' || cap.name === 'method'
          ? 'function'
          : cap.name === 'ty'
            ? 'type'
            : 'const';
      symbols.push({
        name,
        kind,
        exported: isExported(name),
        line: cap.node.startPosition.row + 1,
      });
    }
    symbolQ.delete();

    // ── Callsites ──────────────────────────────────────────────────────
    const callQ = lang.query(CALL_QUERY);
    for (const cap of callQ.captures(tree.rootNode)) {
      callsites.push({
        callee: cap.node.text,
        line: cap.node.startPosition.row + 1,
      });
    }
    callQ.delete();

    // ── HTTP handlers ──────────────────────────────────────────────────
    const handlerQ = lang.query(HANDLER_QUERY);
    for (const match of handlerQ.matches(tree.rootNode)) {
      const recv = match.captures.find((c) => c.name === 'recv')?.node.text;
      const method = match.captures.find((c) => c.name === 'method')?.node.text;
      const pathCap = match.captures.find((c) => c.name === 'path');
      if (!recv || !method || !pathCap) continue;
      if (!HANDLER_METHODS.has(method)) continue;
      if (!ROUTING_RECEIVERS.has(recv)) continue;
      const framework = recv === 'http' ? 'net/http' : 'mux/chi';
      httpHandlers.push({
        method: method.toUpperCase().startsWith('HANDLE') ? undefined : method.toUpperCase(),
        path: stripQuotes(pathCap.node.text),
        line: pathCap.node.startPosition.row + 1,
        framework,
      });
    }
    handlerQ.delete();

    tree.delete();

    return {
      abs: absPath,
      rel: relPath,
      language: 'go',
      imports,
      symbols,
      httpHandlers,
      cliCommands: [],
      callsites,
      loc: source.split('\n').length,
    };
  }
}

function emptyParsed(abs: string, rel: string, source: string): ParsedFile {
  return {
    abs,
    rel,
    language: 'go',
    imports: [],
    symbols: [],
    httpHandlers: [],
    cliCommands: [],
    callsites: [],
    loc: source.split('\n').length,
  };
}
