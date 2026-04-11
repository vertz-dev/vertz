import type { Result } from '@vertz/errors';
import { invoke } from './ipc.js';
import type { DesktopError, IpcCallOptions, ShellOutput } from './types.js';

/**
 * Execute a command with arguments and return stdout, stderr, and exit code.
 *
 * The command is executed directly (not through a shell) to avoid injection risks.
 * Use `args` for all arguments — do NOT concatenate them into the command string.
 */
export function execute(
  command: string,
  args: string[],
  options?: IpcCallOptions,
): Promise<Result<ShellOutput, DesktopError>> {
  return invoke<ShellOutput>('shell.execute', { command, args }, options);
}
