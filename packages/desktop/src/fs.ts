import type { Result } from '@vertz/errors';
import { invoke } from './ipc.js';
import type {
  CreateDirOptions,
  DesktopError,
  DirEntry,
  FileStat,
  IpcCallOptions,
} from './types.js';

/**
 * Read the contents of a text file as a UTF-8 string.
 */
export function readTextFile(
  path: string,
  options?: IpcCallOptions,
): Promise<Result<string, DesktopError>> {
  return invoke<string>('fs.readTextFile', { path }, options);
}

/**
 * Write a string to a file, creating it and parent directories if needed.
 */
export function writeTextFile(
  path: string,
  content: string,
  options?: IpcCallOptions,
): Promise<Result<void, DesktopError>> {
  return invoke<void>('fs.writeTextFile', { path, content }, options);
}

/**
 * Check if a file or directory exists at the given path.
 */
export function exists(
  path: string,
  options?: IpcCallOptions,
): Promise<Result<boolean, DesktopError>> {
  return invoke<boolean>('fs.exists', { path }, options);
}

/**
 * Get metadata about a file or directory.
 */
export function stat(
  path: string,
  options?: IpcCallOptions,
): Promise<Result<FileStat, DesktopError>> {
  return invoke<FileStat>('fs.stat', { path }, options);
}

/**
 * List directory contents (non-recursive).
 */
export function readDir(
  path: string,
  options?: IpcCallOptions,
): Promise<Result<DirEntry[], DesktopError>> {
  return invoke<DirEntry[]>('fs.readDir', { path }, options);
}

/**
 * Create a directory. With `recursive: true`, creates parent directories too.
 */
export function createDir(
  path: string,
  options?: CreateDirOptions & IpcCallOptions,
): Promise<Result<void, DesktopError>> {
  const { recursive, ...ipcOptions } = options ?? {};
  return invoke<void>('fs.createDir', { path, recursive }, ipcOptions);
}

/**
 * Remove a file or directory. Directories are removed recursively.
 */
export function remove(
  path: string,
  options?: IpcCallOptions,
): Promise<Result<void, DesktopError>> {
  return invoke<void>('fs.remove', { path }, options);
}

/**
 * Rename or move a file or directory.
 */
export function rename(
  from: string,
  to: string,
  options?: IpcCallOptions,
): Promise<Result<void, DesktopError>> {
  return invoke<void>('fs.rename', { from, to }, options);
}
