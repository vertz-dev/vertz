/**
 * POC: BearerAuthHandle — auth abstraction that hides signals.
 *
 * Validates:
 * 1. Token injection via handle._strategy
 * 2. setToken() / clear() / isAuthenticated API
 * 3. Dynamic token via function
 * 4. No signal exposed to consumers
 */

export interface BearerAuthStrategy {
  readonly type: 'bearer';
  readonly token: () => string | null;
}

export interface BearerAuthHandle {
  /** Set the authentication token. */
  setToken(token: string): void;
  /** Clear the authentication token. */
  clear(): void;
  /** Whether a token is currently set. */
  readonly isAuthenticated: boolean;
  /** @internal Strategy for FetchClient — not user-facing. */
  readonly _strategy: BearerAuthStrategy;
}

/**
 * Create a bearer auth handle.
 * Accepts either a static token, a dynamic getter function, or nothing.
 */
export function createBearerAuthHandle(
  initialToken?: string | (() => string | null),
): BearerAuthHandle {
  // In real implementation, this would use signal() for reactivity.
  // For POC, a simple let suffices to validate the API shape.
  let token: string | null = null;

  if (typeof initialToken === 'string') {
    token = initialToken;
  }

  const getToken =
    typeof initialToken === 'function'
      ? initialToken
      : () => token;

  return {
    setToken(t: string) {
      token = t;
    },
    clear() {
      token = null;
    },
    get isAuthenticated() {
      return getToken() !== null;
    },
    _strategy: {
      type: 'bearer' as const,
      token: getToken,
    },
  };
}
