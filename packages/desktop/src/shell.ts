import type { Result } from '@vertz/errors';
import { allocateSubscription, addListener, unsubscribe } from './event.js';
import { invoke } from './ipc.js';
import type { DesktopError, IpcCallOptions, ShellOutput } from './types.js';

/** Options for shell.execute(). */
export interface ExecuteOptions {
  /** Working directory. Defaults to app root. */
  cwd?: string;
  /** Additional environment variables merged with the current env. */
  env?: Record<string, string>;
}

/** Options for shell.spawn(). */
export interface SpawnOptions {
  /** Working directory. Defaults to app root. */
  cwd?: string;
  /** Additional environment variables merged with the current env. */
  env?: Record<string, string>;
}

/** Handle to a running child process. */
export interface ChildProcess {
  /** The OS process ID (PID). */
  readonly pid: number;

  /**
   * Register a callback for stdout data chunks.
   * Multiple callbacks are supported — each call appends.
   * Returns a disposer function to remove this specific listener.
   */
  onStdout(callback: (data: string) => void): () => void;

  /**
   * Register a callback for stderr data chunks.
   * Multiple callbacks are supported — each call appends.
   * Returns a disposer function to remove this specific listener.
   */
  onStderr(callback: (data: string) => void): () => void;

  /**
   * Register a callback for process exit.
   * `code` is the exit code (number) or `null` if killed by signal.
   * Returns a disposer function to remove this specific listener.
   */
  onExit(callback: (code: number | null) => void): () => void;

  /**
   * Kill the process. Idempotent — calling on an already-exited process is not an error.
   */
  kill(): Promise<Result<void, DesktopError>>;
}

/**
 * Execute a command and wait for it to finish.
 *
 * The command is executed directly (not through a shell) to avoid injection risks.
 * Use `args` for all arguments — do NOT concatenate them into the command string.
 * Use `shell.spawn()` for long-running processes with streaming output.
 */
export function execute(
  command: string,
  args?: string[],
  options?: ExecuteOptions & IpcCallOptions,
): Promise<Result<ShellOutput, DesktopError>> {
  const { cwd, env, timeout } = options ?? {};
  return invoke<ShellOutput>('shell.execute', { command, args, cwd, env }, { timeout });
}

/** Global subscription ID counter (mirrors Rust-side next_subscription_id). */
let nextSubId = 1;

/**
 * Spawn a long-running process with streaming stdout/stderr.
 *
 * Returns a `ChildProcess` handle with `onStdout`, `onStderr`, `onExit`
 * callbacks and a `kill()` method.
 */
export async function spawn(
  command: string,
  args?: string[],
  options?: SpawnOptions,
): Promise<Result<ChildProcess, DesktopError>> {
  const subId = nextSubId++;
  const { cwd, env } = options ?? {};

  // Pre-allocate subscription BEFORE IPC call to buffer early events
  allocateSubscription(subId);

  const result = await invoke<{ pid: number }>('shell.spawn', { command, args, cwd, env, subId });

  if (!result.ok) {
    // Clean up the pre-allocated subscription
    unsubscribe(subId);
    return result as Result<ChildProcess, DesktopError>;
  }

  const { pid } = result.value;

  const handle: ChildProcess = {
    pid,

    onStdout(callback: (data: string) => void): () => void {
      return addListener(subId, 'stdout', callback as (data: unknown) => void);
    },

    onStderr(callback: (data: string) => void): () => void {
      return addListener(subId, 'stderr', callback as (data: unknown) => void);
    },

    onExit(callback: (code: number | null) => void): () => void {
      return addListener(subId, 'exit', (data: unknown) => {
        callback(data as number | null);
        // Auto-cleanup subscription on exit
        unsubscribe(subId);
      });
    },

    async kill(): Promise<Result<void, DesktopError>> {
      return invoke<void>('process.kill', { subId });
    },
  };

  return { ok: true, value: handle } as Result<ChildProcess, DesktopError>;
}
