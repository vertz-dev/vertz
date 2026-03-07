import type { Context } from '../component/context';
import { createContext, useContext } from '../component/context';
import type { UnwrapSignals } from '../runtime/signal-types';
import type { RouteConfigLike, RouteDefinitionMap } from './define-routes';
import type { Router } from './navigate';
import type { ExtractParams } from './params';

export const RouterContext: Context<Router> = createContext<Router>(
  undefined,
  '@vertz/ui::RouterContext',
);

export function useRouter<
  T extends Record<string, RouteConfigLike> = RouteDefinitionMap,
>(): UnwrapSignals<Router<T>> {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('useRouter() must be called within RouterContext.Provider');
  }
  // Cast is safe: the stored Router was created by createRouter<T>(), which
  // returns Router<T> at the type level. The generic T only narrows navigate()
  // at compile time — at runtime, the router is identical regardless of T.
  return router as UnwrapSignals<Router<T>>;
}

/**
 * Read route params from the current matched route.
 *
 * Overload 1: `useParams<'/tasks/:id'>()` — returns `{ id: string }` (backward compat).
 * Overload 2: `useParams<{ id: number }>()` — returns parsed type assertion
 *   (reads `parsedParams` when a route has a `params` schema).
 *
 * At runtime, both overloads prefer `parsedParams` (schema-parsed) when available,
 * falling back to raw `params` (string values).
 */
export function useParams<TPath extends string = string>(): ExtractParams<TPath>;
export function useParams<T extends Record<string, unknown>>(): T;
export function useParams(): unknown {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('useParams() must be called within RouterContext.Provider');
  }
  return router.current?.parsedParams ?? router.current?.params ?? {};
}
