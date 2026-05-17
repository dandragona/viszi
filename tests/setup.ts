import { beforeAll } from 'vitest';
import { initTreeSitter } from '../src/analyzer/parsers/tree_sitter_base.js';

// Python and Go parsers need the tree-sitter runtime + grammars loaded once
// before any parse() call. Running here keeps individual tests free of the
// boilerplate.
beforeAll(async () => {
  await initTreeSitter();
});
