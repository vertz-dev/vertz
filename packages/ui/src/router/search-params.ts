/**
 * Search params parsing and reactive access.
 */

import { useContext } from '../component/context';
import type { ReadonlySignal } from '../runtime/signal-types';
import type { SearchParamSchema } from './define-routes';
import { RouterContext } from './router-context';

/**
 * Parse URLSearchParams into a typed object, optionally through a schema.
 *
 * @param urlParams - The raw URLSearchParams
 * @param schema - Optional schema with a `parse` method for validation/coercion
 * @returns Parsed search params object
 */
export function parseSearchParams<T = Record<string, string>>(
  urlParams: URLSearchParams,
  schema?: SearchParamSchema<T>,
): T {
  const raw: Record<string, string> = {};
  for (const [key, value] of urlParams.entries()) {
    raw[key] = value;
  }

  if (schema) {
    const result = schema.parse(raw);
    if (result.ok) return result.data;
    return raw as T;
  }

  return raw as T;
}

/**
 * Read the current URL search params from the router context.
 * Returns the raw `URLSearchParams` from the current matched route.
 *
 * Must be called within a `RouterContext.Provider`.
 */
export function useSearchParams(): URLSearchParams;
/**
 * Read the current search params from a reactive signal.
 * Intended to be called inside a reactive context (effect/computed).
 *
 * @param searchSignal - Signal holding the current parsed search params
 * @returns The current search params value
 */
export function useSearchParams<T>(searchSignal: ReadonlySignal<T>): T;
export function useSearchParams<T>(searchSignal?: ReadonlySignal<T>): T | URLSearchParams {
  if (searchSignal) {
    return searchSignal.value;
  }
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('useSearchParams() must be called within RouterContext.Provider');
  }
  return router.current?.searchParams ?? new URLSearchParams();
}
