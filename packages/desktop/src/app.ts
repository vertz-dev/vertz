import type { Result } from '@vertz/errors';
import { invoke } from './ipc.js';
import type { DesktopError, IpcCallOptions } from './types.js';

/**
 * Get the platform-appropriate application data directory.
 *
 * - macOS: `~/Library/Application Support`
 * - Windows: `%APPDATA%`
 * - Linux: `$XDG_DATA_HOME` or `~/.local/share`
 */
export function dataDir(options?: IpcCallOptions): Promise<Result<string, DesktopError>> {
  return invoke<string>('app.dataDir', {}, options);
}

/**
 * Get the platform-appropriate application cache directory.
 *
 * - macOS: `~/Library/Caches`
 * - Windows: `%LOCALAPPDATA%`
 * - Linux: `$XDG_CACHE_HOME` or `~/.cache`
 */
export function cacheDir(options?: IpcCallOptions): Promise<Result<string, DesktopError>> {
  return invoke<string>('app.cacheDir', {}, options);
}

/**
 * Read the `version` field from the nearest `package.json` in CWD ancestors.
 */
export function version(options?: IpcCallOptions): Promise<Result<string, DesktopError>> {
  return invoke<string>('app.version', {}, options);
}
