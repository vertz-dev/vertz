import { getSSRContext } from '../ssr/ssr-render-context';

/**
 * Returns true when running in a real browser environment.
 * Returns false during SSR, even if `window` exists (DOM shim).
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && getSSRContext() === undefined;
}
