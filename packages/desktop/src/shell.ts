import type { Result } from '@vertz/errors';
import { invoke } from './ipc.js';
import type { DesktopError, IpcCallOptions, ShellOutput } from './types.js';

/** Options for shell.execute(). */
export interface ExecuteOptions {
  /** Working directory. Defaults to app root. */
  cwd?: string;
  /** Additional environment variables merged with the current env. */
  env?: Record<string, string>;
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
