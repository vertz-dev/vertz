import type { Result } from '@vertz/errors';
import { err, ok } from '@vertz/errors';
import { binaryFetch, binaryStreamFetch } from './internal/binary-fetch.js';
import { invoke } from './ipc.js';
import type {
  CreateDirOptions,
  DesktopError,
  DesktopErrorCode,
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

/**
 * Read the contents of a binary file as a `Uint8Array`.
 *
 * Uses HTTP transport to avoid the 33% base64 overhead of JSON IPC.
 * Files larger than 2 GiB return an error suggesting `readBinaryStream()`.
 */
export async function readBinaryFile(
  path: string,
  options?: IpcCallOptions,
): Promise<Result<Uint8Array, DesktopError>> {
  const result = await binaryFetch('read', path, undefined, options);
  if (!result.ok) return result;
  return ok(new Uint8Array(await result.value.arrayBuffer()));
}

/**
 * Write binary data to a file, creating it and parent directories if needed.
 *
 * Uses HTTP transport with atomic temp-file + rename for crash safety.
 */
export async function writeBinaryFile(
  path: string,
  data: Uint8Array,
  options?: IpcCallOptions,
): Promise<Result<void, DesktopError>> {
  const result = await binaryFetch('write', path, data, options);
  if (!result.ok) return result;
  return ok(undefined as void);
}

/**
 * Read a binary file as a streaming `ReadableStream<Uint8Array>`.
 *
 * No size limit — data is streamed chunk by chunk without buffering.
 */
export async function readBinaryStream(
  path: string,
  options?: IpcCallOptions,
): Promise<Result<ReadableStream<Uint8Array>, DesktopError>> {
  const result = await binaryFetch('stream/read', path, undefined, options);
  if (!result.ok) return result;
  if (!result.value.body) {
    return err({
      code: 'IO_ERROR' as DesktopErrorCode,
      message: 'Response has no body stream',
    });
  }
  return ok(result.value.body as ReadableStream<Uint8Array>);
}

/**
 * Write binary data from a `ReadableStream<Uint8Array>` to a file.
 *
 * No size limit — data is written chunk by chunk without buffering.
 * Atomic write (temp file + rename) for crash safety.
 */
export async function writeBinaryStream(
  path: string,
  data: ReadableStream<Uint8Array>,
  options?: IpcCallOptions,
): Promise<Result<void, DesktopError>> {
  const result = await binaryStreamFetch(path, data, options);
  if (!result.ok) return result;
  return ok(undefined as void);
}
