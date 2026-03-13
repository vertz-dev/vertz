import { hasSSRResolver } from '../ssr/ssr-render-context';

/**
 * Returns true when running in a real browser environment.
 * Returns false on the server, even if `window` exists (DOM shim).
 *
 * Uses `hasSSRResolver()` — which returns true when an SSR resolver
 * has been registered — instead of `getSSRContext()` which only returns
 * a value inside `ssrStorage.run()`. This correctly identifies server
 * module-scope code (e.g., HMR re-imports where `createRouter()` runs
 * at import time, outside any SSR render context).
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && !hasSSRResolver();
}
