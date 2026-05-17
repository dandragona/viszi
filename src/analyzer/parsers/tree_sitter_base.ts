import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Parser from 'web-tree-sitter';
import { grammarsDir } from '../../shared/paths.js';

let initPromise: Promise<void> | null = null;
const languages = new Map<string, Parser.Language>();

export type GrammarName = 'python' | 'go';

const GRAMMAR_FILE: Record<GrammarName, string> = {
  python: 'tree-sitter-python.wasm',
  go: 'tree-sitter-go.wasm',
};

/**
 * Initialise the tree-sitter runtime and pre-load every grammar viszi ships.
 * Idempotent — safe to call from multiple call sites; first call drives the work.
 * Callers must `await` this before constructing any TreeSitterParser instance.
 */
export function initTreeSitter(): Promise<void> {
  if (!initPromise) initPromise = doInit();
  return initPromise;
}

async function doInit(): Promise<void> {
  const dir = grammarsDir();
  const runtimeWasm = readFileSync(resolve(dir, 'tree-sitter.wasm'));
  await Parser.init({ wasmBinary: runtimeWasm });
  for (const [name, file] of Object.entries(GRAMMAR_FILE) as [GrammarName, string][]) {
    const bytes = readFileSync(resolve(dir, file));
    const lang = await Parser.Language.load(bytes);
    languages.set(name, lang);
  }
}

export function getGrammar(name: GrammarName): Parser.Language {
  const lang = languages.get(name);
  if (!lang) {
    throw new Error(
      `tree-sitter grammar "${name}" not loaded — call await initTreeSitter() before parsing.`,
    );
  }
  return lang;
}

export function newParser(name: GrammarName): Parser {
  const parser = new Parser();
  parser.setLanguage(getGrammar(name));
  return parser;
}
