import { readFileSync } from 'node:fs';
import type { Language } from '../languages.js';
import type { LanguageParser, ParsedFile } from './types.js';
import { JsLikeParser } from './regex_js.js';
import { PythonTreeSitterParser } from './tree_sitter_python.js';
import { GoTreeSitterParser } from './tree_sitter_go.js';

const REGISTRY = new Map<Language, LanguageParser>();

function register(parser: LanguageParser) {
  const langs = Array.isArray(parser.language) ? parser.language : [parser.language];
  for (const l of langs) REGISTRY.set(l, parser);
}

register(new JsLikeParser());
register(new PythonTreeSitterParser());
register(new GoTreeSitterParser());

export function getParser(language: Language): LanguageParser | undefined {
  return REGISTRY.get(language);
}

export function parseFile(absPath: string, relPath: string, language: Language): ParsedFile | null {
  const parser = getParser(language);
  if (!parser) return null;
  let source: string;
  try {
    source = readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = parser.parse(absPath, relPath, source);
    parsed.language = language;
    return parsed;
  } catch {
    return null;
  }
}

export type { ParsedFile, LanguageParser } from './types.js';
