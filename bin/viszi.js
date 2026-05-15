#!/usr/bin/env node
// viszi CLI entrypoint shim. Loads the compiled CLI module.
import('../dist/cli/index.js').catch((err) => {
  console.error('Failed to start viszi:', err?.stack ?? err);
  process.exit(1);
});
