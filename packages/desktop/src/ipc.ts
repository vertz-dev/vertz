import { err, ok } from '@vertz/errors';
import type { Result } from '@vertz/errors';
import type { DesktopError, DesktopErrorCode, IpcCallOptions } from './types.js';

/** Shape of the native IPC bridge injected by the Rust runtime. */
interface VtzIpc {
  invoke(
    method: string,
    params: Record<string, unknown>,
    options?: { timeout?: number },
  ): Promise<
    { ok: true; result: unknown } | { ok: false; error: { code: string; message: string } }
  >;
}

declare global {
  interface Window {
    __vtz_ipc?: VtzIpc;
    /** Session nonce injected by the Rust runtime for binary file HTTP authentication. */
    __vtz_ipc_token?: string;
  }
}

/**
 * Invoke a native IPC method with full type safety.
 *
 * Returns `Result<T, DesktopError>` — never throws.
 */
export async function invoke<T>(
  method: string,
  params: Record<string, unknown>,
  options?: IpcCallOptions,
): Promise<Result<T, DesktopError>> {
  if (typeof window === 'undefined' || !window.__vtz_ipc) {
    return err({
      code: 'EXECUTION_FAILED' as DesktopErrorCode,
      message: '@vertz/desktop: IPC bridge not available. Are you running in the native webview?',
    });
  }

  const response = await window.__vtz_ipc.invoke(method, params, options);

  if (response.ok) {
    return ok(response.result as T);
  }

  return err({
    code: response.error.code as DesktopErrorCode,
    message: response.error.message,
  });
}
