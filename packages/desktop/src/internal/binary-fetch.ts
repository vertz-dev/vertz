import { err, ok } from '@vertz/errors';
import type { Result } from '@vertz/errors';
import type { DesktopError, DesktopErrorCode, IpcCallOptions } from '../types.js';

type BinaryOperation = 'read' | 'write' | 'stream/read' | 'stream/write';

/**
 * Internal helper that sends binary file requests over HTTP to the Rust
 * dev server's sidecar routes, authenticating with the session nonce.
 *
 * Returns `Result<Response, DesktopError>` — the caller converts the
 * response body to `Uint8Array`, `ReadableStream`, or discards it for writes.
 */
export async function binaryFetch(
  operation: BinaryOperation,
  path: string,
  body?: Uint8Array,
  options?: IpcCallOptions,
): Promise<Result<Response, DesktopError>> {
  return internalFetch(operation, path, bodyToArrayBuffer(body), options);
}

/**
 * Internal helper for streaming writes that accept a `ReadableStream` body.
 */
export async function binaryStreamFetch(
  path: string,
  stream: ReadableStream<Uint8Array>,
  options?: IpcCallOptions,
): Promise<Result<Response, DesktopError>> {
  return internalFetch('stream/write', path, stream, options);
}

function bodyToArrayBuffer(body?: Uint8Array): ArrayBuffer | null {
  if (!body) return null;
  return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
}

async function internalFetch(
  operation: BinaryOperation,
  path: string,
  body: BodyInit | null,
  options?: IpcCallOptions,
): Promise<Result<Response, DesktopError>> {
  if (typeof window === 'undefined' || !window.__vtz_ipc_token) {
    return err({
      code: 'EXECUTION_FAILED' as DesktopErrorCode,
      message:
        '@vertz/desktop: IPC session token not available. Are you running in the native webview?',
    });
  }

  const encodedPath = encodeURIComponent(path);
  const url = `/__vertz_fs_binary/${operation}?path=${encodedPath}`;
  const isWrite = operation === 'write' || operation === 'stream/write';

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (options?.timeout) {
    timer = setTimeout(() => controller.abort(), options.timeout);
  }

  try {
    const response = await fetch(url, {
      method: isWrite ? 'POST' : 'GET',
      headers: {
        'X-VTZ-IPC-Token': window.__vtz_ipc_token,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const json = (await response.json().catch(() => null)) as {
          code?: string;
          message?: string;
        } | null;
        return err({
          code: (json?.code ?? 'IO_ERROR') as DesktopErrorCode,
          message:
            json?.message ?? `Binary file ${operation} failed with status ${response.status}`,
        });
      }
      const text = await response.text().catch(() => '');
      return err({
        code: 'IO_ERROR' as DesktopErrorCode,
        message: text || `Binary file ${operation} failed with status ${response.status}`,
      });
    }

    return ok(response);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return err({
        code: 'TIMEOUT' as DesktopErrorCode,
        message: `Binary file ${operation} timed out after ${options?.timeout}ms`,
      });
    }
    return err({
      code: 'IO_ERROR' as DesktopErrorCode,
      message: `Binary file ${operation} failed: ${e instanceof Error ? e.message : String(e)}`,
    });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
