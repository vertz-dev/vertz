import type { Result } from '@vertz/errors';
import { invoke } from './ipc.js';
import type { DesktopError, IpcCallOptions } from './types.js';

/**
 * Read text from the system clipboard.
 */
export function readText(options?: IpcCallOptions): Promise<Result<string, DesktopError>> {
  return invoke<string>('clipboard.readText', {}, options);
}

/**
 * Write text to the system clipboard.
 */
export function writeText(
  text: string,
  options?: IpcCallOptions,
): Promise<Result<void, DesktopError>> {
  return invoke<void>('clipboard.writeText', { text }, options);
}
