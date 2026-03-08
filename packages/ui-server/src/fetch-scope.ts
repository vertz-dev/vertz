/**
 * Per-request fetch scoping via AsyncLocalStorage.
 *
 * Instead of mutating globalThis.fetch per-render (which races with concurrent
 * SSR requests), this module installs a SINGLE fetch proxy at startup that
 * delegates to a per-request interceptor stored in AsyncLocalStorage.
 *
 * Usage:
 * 1. Call installFetchProxy() once at server startup
 * 2. Wrap each SSR render in runWithScopedFetch(interceptor, fn)
 * 3. Any fetch() call inside fn() routes through the interceptor
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const fetchScope = new AsyncLocalStorage<typeof fetch>();

/** The original fetch function, captured before proxy installation. */
let _originalFetch: typeof fetch | null = null;

/**
 * Install a global fetch proxy that delegates to per-request interceptors.
 *
 * Call once at server startup. Subsequent calls are no-ops.
 * Outside of runWithScopedFetch(), fetch() behaves normally.
 */
export function installFetchProxy(): void {
  if (_originalFetch !== null) return; // already installed
  const original = globalThis.fetch;
  _originalFetch = original;

  const proxy: typeof fetch = (input, init) => {
    const scoped = fetchScope.getStore();
    if (scoped) return scoped(input, init);
    return original(input, init);
  };
  proxy.preconnect = original.preconnect;
  globalThis.fetch = proxy;
}

/**
 * Run a function with a scoped fetch interceptor.
 *
 * Any fetch() call inside fn() routes through the interceptor.
 * Calls outside fn() (or without installFetchProxy()) use the original fetch.
 */
export function runWithScopedFetch<T>(interceptor: typeof fetch, fn: () => T): T {
  return fetchScope.run(interceptor, fn);
}

/** Reset fetch proxy state. Used in tests only. */
export function _resetFetchProxy(): void {
  if (_originalFetch !== null) {
    globalThis.fetch = _originalFetch;
    _originalFetch = null;
  }
}
