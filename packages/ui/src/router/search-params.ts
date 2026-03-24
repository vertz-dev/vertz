/**
 * Search params parsing and reactive access.
 */

import { useContext } from '../component/context';
import type { ReadonlySignal } from '../runtime/signal-types';
import type { SearchParamSchema } from './define-routes';
import type { ReactiveSearchParams } from './reactive-search-params';
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
 * Read the current search params as a reactive, writable proxy.
 *
 * Reads are reactive (trigger signal tracking), writes batch-navigate
 * to update the URL. Must be called within a `RouterContext.Provider`.
 */
export function useSearchParams<
  T extends Record<string, unknown> = Record<string, string>,
>(): ReactiveSearchParams<T>;
/**
 * Read the current search params from a reactive signal.
 *
 * @deprecated Use the zero-arg `useSearchParams()` overload instead.
 * @param searchSignal - Signal holding the current parsed search params
 * @returns The current search params value
 */
export function useSearchParams<T>(searchSignal: ReadonlySignal<T>): T;
export function useSearchParams<T>(searchSignal?: ReadonlySignal<T>): T | ReactiveSearchParams {
  if (searchSignal) {
    return searchSignal.value;
  }
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('useSearchParams() must be called within RouterContext.Provider');
  }
  return router._reactiveSearchParams;
}
