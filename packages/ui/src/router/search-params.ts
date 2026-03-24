/**
 * Search params parsing and reactive access.
 */

import { useContext } from '../component/context';
import type {
  ExtractSearchParams,
  RouteConfigLike,
  RouteDefinitionMap,
  SearchParamSchema,
} from './define-routes';
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
 * Overload 1: `useSearchParams<'/search'>()` — infers search param types from
 * the route's `searchParams` schema via `ExtractSearchParams`. Requires codegen
 * augmentation or explicit `TMap` generic for full type inference.
 *
 * Overload 2: `useSearchParams<{ q: string; page: number }>()` — explicit type.
 *
 * Overload 3: `useSearchParams()` — no generic, returns `Record<string, string>`.
 *
 * Reads are reactive (trigger signal tracking), writes batch-navigate
 * to update the URL. Must be called within a `RouterContext.Provider`.
 */
export function useSearchParams<
  TPath extends string = string,
  TMap extends Record<string, RouteConfigLike> = RouteDefinitionMap,
>(): ReactiveSearchParams<ExtractSearchParams<TPath, TMap>>;
/**
 * Read the current search params with an explicit type assertion.
 */
export function useSearchParams<T extends Record<string, unknown>>(): ReactiveSearchParams<T>;
export function useSearchParams(): ReactiveSearchParams {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('useSearchParams() must be called within RouterContext.Provider');
  }
  return router._reactiveSearchParams;
}
