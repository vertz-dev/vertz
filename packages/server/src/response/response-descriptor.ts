/**
 * Symbol brand for ResponseDescriptor — eliminates collision risk with user data.
 * Unlike ContentDescriptor (which tags schema objects), ResponseDescriptor wraps
 * user data — a handler's return value. A symbol brand prevents false positives.
 */
export const RESPONSE_BRAND: unique symbol = Symbol.for('vertz.response');

/**
 * Wraps handler output with optional HTTP response metadata (headers, status).
 * Used by service and entity action handlers to customize the HTTP response
 * without losing type safety or schema validation.
 */
export interface ResponseDescriptor<T> {
  readonly [RESPONSE_BRAND]: true;
  readonly data: T;
  readonly status?: number;
  readonly headers?: Record<string, string>;
}

/**
 * Creates a ResponseDescriptor that wraps handler data with HTTP metadata.
 *
 * @example
 * ```ts
 * return response({ keys }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
 * ```
 */
export function response<T>(
  data: T,
  options?: { status?: number; headers?: Record<string, string> },
): ResponseDescriptor<T> {
  return {
    [RESPONSE_BRAND]: true,
    data,
    status: options?.status,
    headers: options?.headers,
  };
}

/**
 * Runtime type guard — checks if a value is a ResponseDescriptor.
 */
export function isResponseDescriptor(value: unknown): value is ResponseDescriptor<unknown> {
  return value != null && typeof value === 'object' && RESPONSE_BRAND in value;
}

/**
 * Filters protected headers (content-type) from custom headers, case-insensitively.
 * Returns undefined if input is undefined or all headers are filtered out.
 */
export function filterProtectedHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== 'content-type') {
      filtered[key] = value;
    }
  }
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}
