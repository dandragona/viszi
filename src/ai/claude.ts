import { execa, type ExecaError } from 'execa';

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
 * Invoke Claude Code in non-interactive mode with a JSON-schema-constrained
 * response. Returns the parsed structured result.
 */
export async function callClaude<T>(opts: CallClaudeOpts): Promise<ClaudeCallResult<T>> {
  const start = Date.now();
  const args: string[] = ['-p'];
  args.push('--output-format', 'json');
  args.push('--json-schema', JSON.stringify(opts.schema));
  if (opts.maxBudgetUsd !== undefined) {
    args.push('--max-budget-usd', String(opts.maxBudgetUsd));
  }
  if (opts.model) args.push('--model', opts.model);
  if (opts.bare) args.push('--bare');
  if (opts.addDirs?.length) {
    args.push('--add-dir', ...opts.addDirs);
  }
  args.push(opts.prompt);

  let result: { stdout: string; stderr: string };
  try {
    result = await execa('claude', args, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs ?? 5 * 60_000,
      stdio: ['ignore', 'pipe', 'pipe'],
      reject: true,
    });
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
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(result.stdout);
  } catch (err) {
    throw new ClaudeCallError(
      `Could not parse Claude JSON envelope: ${(err as Error).message}`,
      result.stderr,
      result.stdout,
    );
  }

  const env = envelope as {
    result?: unknown;
    total_cost_usd?: number;
    is_error?: boolean;
    error?: string;
  };
  if (env.is_error) {
    throw new ClaudeCallError(env.error ?? 'Claude reported an error', result.stderr, result.stdout);
  }

  const raw = env.result;
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
          result.stderr,
          result.stdout,
        );
      }
      data = JSON.parse(match[0]) as T;
    }
  } else if (raw && typeof raw === 'object') {
    data = raw as T;
  } else {
    throw new ClaudeCallError(
      `Claude returned an unexpected envelope shape: ${typeof raw}`,
      result.stderr,
      result.stdout,
    );
  }

  return {
    data,
    costUsd: env.total_cost_usd,
    durationMs: Date.now() - start,
  };
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
