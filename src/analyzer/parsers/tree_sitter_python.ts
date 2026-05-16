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
  (import_statement name: (dotted_name) @module)
  (import_statement name: (aliased_import name: (dotted_name) @module))
  (import_from_statement
    module_name: [(dotted_name) (relative_import)] @module
    name: (dotted_name) @bound)
  (import_from_statement
    module_name: [(dotted_name) (relative_import)] @module
    name: (aliased_import alias: (identifier) @bound))
  (import_from_statement
    module_name: [(dotted_name) (relative_import)] @module
    (wildcard_import) @bound)
`;

const SYMBOL_QUERY = `
  (module (function_definition name: (identifier) @fn))
  (module (decorated_definition (function_definition name: (identifier) @fn)))
  (module (class_definition name: (identifier) @cls))
  (module (decorated_definition (class_definition name: (identifier) @cls)))
`;

const CALL_QUERY = `
  (call function: (identifier) @callee)
  (call function: (attribute attribute: (identifier) @callee))
`;

const HANDLER_QUERY = `
  ; Flask / blueprint: @app.route("/path", methods=[...])
  (decorator
    (call
      function: (attribute
        object: (identifier) @obj
        attribute: (identifier) @decname (#eq? @decname "route"))
      arguments: (argument_list . (string) @path))) @flask

  ; FastAPI / router: @router.get("/path"), @app.post("/x")
  (decorator
    (call
      function: (attribute
        object: (identifier) @obj
        attribute: (identifier) @method
        (#match? @method "^(get|post|put|patch|delete|options|head)$"))
      arguments: (argument_list . (string) @path))) @fastapi
`;

const FASTAPI_OBJECTS = new Set(['app', 'router']);
const FLASK_OBJECTS = new Set(['app', 'blueprint', 'bp']);

function stringNodeText(text: string): string {
  // Strip leading u/r/b prefixes and the surrounding quotes.
  const m = text.match(/^[uUrRbBfF]*['"`]{1,3}([\s\S]*?)['"`]{1,3}$/);
  return m ? m[1] : text;
}

function isExported(name: string): boolean {
  return !name.startsWith('_');
}

let cachedParser: Parser | null = null;
function getParser(): Parser {
  if (!cachedParser) cachedParser = newParser('python');
  return cachedParser;
}

export class PythonTreeSitterParser implements LanguageParser {
  readonly language: Language = 'python';

  parse(absPath: string, relPath: string, source: string): ParsedFile {
    const parser = getParser();
    const tree = parser.parse(source);
    if (!tree) {
      return emptyParsed(absPath, relPath, source);
    }
    const lang = parser.getLanguage();

    const imports: ImportRef[] = [];
    const symbols: SymbolRef[] = [];
    const callsites: CallsiteRef[] = [];
    const httpHandlers: HandlerRef[] = [];

    // ── Imports ────────────────────────────────────────────────────────
    const importQ = lang.query(IMPORT_QUERY);
    for (const match of importQ.matches(tree.rootNode)) {
      const moduleCap = match.captures.find((c) => c.name === 'module');
      const boundCap = match.captures.find((c) => c.name === 'bound');
      if (!moduleCap) continue;
      const raw = moduleCap.node.text;
      const kind: ImportRef['kind'] = boundCap ? 'from' : 'import';
      const ref: ImportRef = { raw, kind };
      if (boundCap) {
        const name = boundCap.node.text;
        if (name !== '*') ref.boundNames = [name];
      }
      imports.push(ref);
    }
    importQ.delete();

    // ── Top-level symbols ──────────────────────────────────────────────
    const symbolQ = lang.query(SYMBOL_QUERY);
    for (const cap of symbolQ.captures(tree.rootNode)) {
      const name = cap.node.text;
      const kind = cap.name === 'cls' ? 'class' : 'function';
      symbols.push({
        name,
        kind,
        exported: isExported(name),
        line: cap.node.startPosition.row + 1,
      });
    }
    symbolQ.delete();

    // ── Callsites (the actual quality win) ─────────────────────────────
    const callQ = lang.query(CALL_QUERY);
    const importMap = buildImportMap(imports);
    for (const cap of callQ.captures(tree.rootNode)) {
      const callee = cap.node.text;
      const site: CallsiteRef = {
        callee,
        line: cap.node.startPosition.row + 1,
      };
      const from = importMap.get(callee);
      if (from) site.fromImport = from;
      callsites.push(site);
    }
    callQ.delete();

    // ── HTTP handlers ──────────────────────────────────────────────────
    const handlerQ = lang.query(HANDLER_QUERY);
    for (const match of handlerQ.matches(tree.rootNode)) {
      const obj = match.captures.find((c) => c.name === 'obj')?.node.text;
      const pathCap = match.captures.find((c) => c.name === 'path');
      if (!obj || !pathCap) continue;
      const path = stringNodeText(pathCap.node.text);
      const line = pathCap.node.startPosition.row + 1;
      const tag = match.captures.find((c) => c.name === 'flask' || c.name === 'fastapi')?.name;
      if (tag === 'flask' && FLASK_OBJECTS.has(obj)) {
        httpHandlers.push({ method: 'GET', path, line, framework: 'flask' });
      } else if (tag === 'fastapi' && FASTAPI_OBJECTS.has(obj)) {
        const method = match.captures.find((c) => c.name === 'method')?.node.text.toUpperCase();
        httpHandlers.push({ method, path, line, framework: 'fastapi' });
      }
    }
    handlerQ.delete();

    // ── Django path() calls (call-site, not decorator) ─────────────────
    const djangoQ = lang.query(`
      (call
        function: (identifier) @fn (#eq? @fn "path")
        arguments: (argument_list . (string) @path . (_) @view))
    `);
    for (const match of djangoQ.matches(tree.rootNode)) {
      const pathCap = match.captures.find((c) => c.name === 'path');
      const viewCap = match.captures.find((c) => c.name === 'view');
      if (!pathCap) continue;
      httpHandlers.push({
        method: 'GET',
        path: stringNodeText(pathCap.node.text),
        handler: viewCap?.node.text,
        line: pathCap.node.startPosition.row + 1,
        framework: 'django',
      });
    }
    djangoQ.delete();

    tree.delete();

    return {
      abs: absPath,
      rel: relPath,
      language: 'python',
      imports,
      symbols,
      httpHandlers,
      cliCommands: [],
      callsites,
      loc: source.split('\n').length,
    };
  }
}

/**
 * Map local identifier → originating module specifier.
 * Used to link a call like `foo()` back to its `from x import foo` source.
 */
function buildImportMap(imports: ImportRef[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const imp of imports) {
    if (imp.kind === 'from' && imp.boundNames) {
      for (const n of imp.boundNames) out.set(n, imp.raw);
    } else if (imp.kind === 'import') {
      // `import foo.bar` binds the top segment locally as `foo`.
      const top = imp.raw.split('.')[0];
      out.set(top, imp.raw);
    }
  }
  return out;
}

function emptyParsed(abs: string, rel: string, source: string): ParsedFile {
  return {
    abs,
    rel,
    language: 'python',
    imports: [],
    symbols: [],
    httpHandlers: [],
    cliCommands: [],
    callsites: [],
    loc: source.split('\n').length,
  };
}
