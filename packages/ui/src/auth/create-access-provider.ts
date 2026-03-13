/**
 * createAccessProvider — bootstrap from window.__VERTZ_ACCESS_SET__.
 *
 * Creates the signal pair for AccessContext.Provider, hydrating
 * from the SSR-injected global when available.
 */

import { isBrowser } from '../env/is-browser';
import { signal } from '../runtime/signal';
import type { AccessContextValue } from './access-context';
import type { AccessSet } from './access-set-types';

declare global {
  interface Window {
    __VERTZ_ACCESS_SET__?: AccessSet;
  }
}

/**
 * Create an AccessContextValue for use with AccessContext.Provider.
 * Hydrates from `window.__VERTZ_ACCESS_SET__` when available (SSR).
 *
 * @example
 * ```tsx
 * const accessValue = createAccessProvider();
 * <AccessContext.Provider value={accessValue}>
 *   <App />
 * </AccessContext.Provider>
 * ```
 */
export function createAccessProvider(): AccessContextValue {
  const accessSet = signal<AccessSet | null>(null);
  const loading = signal(true);

  // Client: hydrate from SSR-injected global (with minimal shape validation)
  if (
    isBrowser() &&
    window.__VERTZ_ACCESS_SET__ &&
    typeof window.__VERTZ_ACCESS_SET__.entitlements === 'object' &&
    window.__VERTZ_ACCESS_SET__.entitlements !== null
  ) {
    accessSet.value = window.__VERTZ_ACCESS_SET__;
    loading.value = false;
  }

  return { accessSet, loading };
}
