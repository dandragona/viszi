# 004 — Config Spec

`viszi` looks for an optional config file via `cosmiconfig`. Precedence (first match wins):

1. `package.json` → `"viszi": { ... }`
2. `.viszirc`
3. `.viszirc.json`
4. `.viszi.json`
5. `viszi.config.json`
6. `viszi.config.js`

## Schema (TypeScript)

```ts
interface VisziConfig {
  exclude?: string[];                 // extra glob excludes (added to defaults)
  include?: string[];                 // restrict the scan to these globs
  modules?: Record<string, string[]>; // user-defined module groupings
  componentKinds?: Record<string, ComponentKind>; // glob → kind override
  flows?: {
    include?: string[];               // flow-id allowlist (after AI emits them)
    exclude?: string[];               // flow-id denylist
  };
  ai?: {
    model?: string;                   // 'opus' | 'sonnet' | 'haiku' | full id
    maxBudgetUsd?: number;
    concurrency?: number;
  };
}
```

## Example

```json
{
  "exclude": ["docs/**", "examples/**"],
  "include": ["src/**", "lib/**"],
  "modules": {
    "auth": ["src/auth/**", "src/middleware/auth.ts"],
    "billing": ["src/billing/**"]
  },
  "componentKinds": {
    "src/db/**": "database",
    "src/queue/**": "queue"
  },
  "flows": {
    "include": ["login", "checkout"]
  },
  "ai": {
    "model": "sonnet",
    "maxBudgetUsd": 0.25,
    "concurrency": 6
  }
}
```

## Precedence vs. CLI flags

CLI flags **always win** over config-file values. Config-file values **always win** over heuristic defaults.
