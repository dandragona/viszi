import { execa, type ExecaError, type ResultPromise } from 'execa';

// In-flight `claude` children so we can terminate them on SIGINT.
const inflight = new Set<ResultPromise>();

/**
 * Send SIGTERM to every in-flight `claude` subprocess. Idempotent.
 * Called by the CLI's SIGINT handler so Ctrl-C doesn't leave orphan processes.
 */
export function terminateInflightClaude(signal: NodeJS.Signals = 'SIGTERM'): number {
  let killed = 0;
  for (const child of inflight) {
    try {
      child.kill(signal);
      killed++;
    } catch {
      /* already dead */
    }
  }
  return killed;
}

/** Visible for tests: how many `claude` subprocesses are currently running. */
export function inflightClaudeCount(): number {
  return inflight.size;
}

export interface CallClaudeOpts {
  prompt: string;
  schema: object;
  cwd?: string;
  maxBudgetUsd?: number;
  model?: string;
  timeoutMs?: number;
  bare?: boolean;
  /** Extra dirs for Claude tool access (Read/Grep). */
  addDirs?: string[];
}

export interface ClaudeCallResult<T> {
  data: T;
  costUsd?: number;
  durationMs: number;
}

export class ClaudeUnavailableError extends Error {
  constructor() {
    super(
      'The `claude` command was not found. Install Claude Code from https://docs.claude.com/en/docs/claude-code/overview and ensure it is on your PATH.',
    );
    this.name = 'ClaudeUnavailableError';
  }
}

export class ClaudeCallError extends Error {
  constructor(
    message: string,
    readonly stderr?: string,
    readonly stdout?: string,
  ) {
    super(message);
    this.name = 'ClaudeCallError';
  }
}

/**
 * Build the argv passed to `claude`. Exported for unit tests so we can guard
 * against regressions on flag-shape decisions (notably `--add-dir=<path>`).
 */
export function buildClaudeArgs(opts: CallClaudeOpts): string[] {
  const args: string[] = ['-p'];
  args.push('--output-format', 'json');
  args.push('--json-schema', JSON.stringify(opts.schema));
  if (opts.maxBudgetUsd !== undefined) {
    args.push('--max-budget-usd', String(opts.maxBudgetUsd));
  }
  if (opts.model) args.push('--model', opts.model);
  if (opts.bare) args.push('--bare');
  // `--add-dir` is variadic in current `claude` CLI builds: writing it as
  // `--add-dir /path` would let the very next positional argument (our prompt!)
  // be swallowed as another directory. The `--add-dir=<path>` form binds a
  // single value, leaving the prompt unambiguously positional.
  if (opts.addDirs?.length) {
    for (const d of opts.addDirs) args.push(`--add-dir=${d}`);
  }
  args.push(opts.prompt);
  return args;
}

interface ClaudeEnvelope {
  result?: unknown;
  structured_output?: unknown;
  total_cost_usd?: number;
  is_error?: boolean;
  error?: string;
  errors?: unknown;
  subtype?: string;
}

/**
 * Parse and validate the JSON envelope `claude -p --output-format json` emits.
 * Throws `ClaudeCallError` for malformed JSON, claude-reported errors, or
 * unexpected shapes. Exported so we can unit-test envelope changes — the live
 * `claude` CLI envelope has evolved across versions.
 */
export function parseClaudeEnvelope<T>(stdout: string, stderr = ''): { data: T; costUsd?: number } {
  let envelope: unknown;
  try {
    envelope = JSON.parse(stdout);
  } catch (err) {
    throw new ClaudeCallError(
      `Could not parse Claude JSON envelope: ${(err as Error).message}`,
      stderr,
      stdout,
    );
  }

  const env = envelope as ClaudeEnvelope;
  if (env.is_error) {
    throw new ClaudeCallError(claudeErrorMessage(env), stderr, stdout);
  }

  // Current `claude -p --json-schema` builds put the schema-conformant payload
  // in `structured_output` and a free-text summary in `result`. Older builds
  // (and non-schema runs) only populate `result`. Prefer the structured field
  // when present so we don't have to re-parse the summary string.
  const raw = env.structured_output ?? env.result;
  let data: T;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw) as T;
    } catch {
      // Fallback: try to find a JSON block in the string
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new ClaudeCallError(
          'Claude returned a string result that is not parseable JSON',
          stderr,
          stdout,
        );
      }
      data = JSON.parse(match[0]) as T;
    }
  } else if (raw && typeof raw === 'object') {
    data = raw as T;
  } else {
    throw new ClaudeCallError(
      `Claude returned an unexpected envelope shape: ${typeof raw}`,
      stderr,
      stdout,
    );
  }

  return { data, costUsd: env.total_cost_usd };
}

function claudeErrorMessage(env: ClaudeEnvelope): string {
  if (typeof env.error === 'string' && env.error.length > 0) return env.error;
  if (Array.isArray(env.errors)) {
    const first = env.errors.find((e): e is string => typeof e === 'string' && e.length > 0);
    if (first) return first;
  }
  if (typeof env.subtype === 'string' && env.subtype.length > 0) {
    return `Claude reported an error (${env.subtype})`;
  }
  return 'Claude reported an error';
}

/**
 * Invoke Claude Code in non-interactive mode with a JSON-schema-constrained
 * response. Returns the parsed structured result.
 */
export async function callClaude<T>(opts: CallClaudeOpts): Promise<ClaudeCallResult<T>> {
  const start = Date.now();
  const args = buildClaudeArgs(opts);

  let result: { stdout: string; stderr: string };
  // execa returns a thenable that doubles as the child handle — keep both so we
  // can track the child in `inflight` until the promise settles.
  const child = execa('claude', args, {
    cwd: opts.cwd,
    timeout: opts.timeoutMs ?? 5 * 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
    reject: true,
    // `cleanup: true` is execa's default — children are terminated when the
    // parent exits. We pass it explicitly so a future execa upgrade can't
    // silently flip the default.
    cleanup: true,
  });
  inflight.add(child);
  try {
    result = await child;
  } catch (raw) {
    const err = raw as ExecaError;
    if (err.code === 'ENOENT') {
      throw new ClaudeUnavailableError();
    }
    throw new ClaudeCallError(
      err.shortMessage ?? err.message,
      typeof err.stderr === 'string' ? err.stderr : undefined,
      typeof err.stdout === 'string' ? err.stdout : undefined,
    );
  } finally {
    inflight.delete(child);
  }

  const { data, costUsd } = parseClaudeEnvelope<T>(result.stdout, result.stderr);
  return { data, costUsd, durationMs: Date.now() - start };
}

/**
 * Quick check: is the `claude` CLI available?
 */
export async function isClaudeAvailable(): Promise<boolean> {
  try {
    await execa('claude', ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
