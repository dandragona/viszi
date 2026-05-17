#!/usr/bin/env node
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outDir = resolve(repoRoot, 'grammars');
const nm = resolve(repoRoot, 'node_modules');

const FILES = [
  [resolve(nm, 'web-tree-sitter/tree-sitter.wasm'), resolve(outDir, 'tree-sitter.wasm')],
  [resolve(nm, 'tree-sitter-wasms/out/tree-sitter-python.wasm'), resolve(outDir, 'tree-sitter-python.wasm')],
  [resolve(nm, 'tree-sitter-wasms/out/tree-sitter-go.wasm'), resolve(outDir, 'tree-sitter-go.wasm')],
];

mkdirSync(outDir, { recursive: true });

for (const [src, dest] of FILES) {
  if (!existsSync(src)) {
    console.error(`[build-grammars] missing source: ${src}`);
    process.exit(1);
  }
  copyFileSync(src, dest);
  console.log(`[build-grammars] ${dest.replace(repoRoot + '/', '')}`);
}
