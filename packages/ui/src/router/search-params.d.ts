/**
 * Search params parsing and reactive access.
 */
import type { ReadonlySignal } from '../runtime/signal-types';
import type { SearchParamSchema } from './define-routes';
/**
 * Parse URLSearchParams into a typed object, optionally through a schema.
 *
 * @param urlParams - The raw URLSearchParams
 * @param schema - Optional schema with a `parse` method for validation/coercion
 * @returns Parsed search params object
 */
export declare function parseSearchParams<T = Record<string, string>>(
  urlParams: URLSearchParams,
  schema?: SearchParamSchema<T>,
): T;
/**
 * Read the current search params from a reactive signal.
 * Intended to be called inside a reactive context (effect/computed).
 *
 * @param searchSignal - Signal holding the current parsed search params
 * @returns The current search params value
 */
export declare function useSearchParams<T>(searchSignal: ReadonlySignal<T>): T;
//# sourceMappingURL=search-params.d.ts.map
