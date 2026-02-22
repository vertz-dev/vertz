import type { Context } from '../component/context';
import { createContext, useContext } from '../component/context';
import type { RouteConfigLike, RouteDefinitionMap } from './define-routes';
import type { Router } from './navigate';
import type { ExtractParams } from './params';

export const RouterContext: Context<Router> = createContext<Router>();

export function useRouter<
  T extends Record<string, RouteConfigLike> = RouteDefinitionMap,
>(): Router<T> {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('useRouter() must be called within RouterContext.Provider');
  }
  // Cast is safe: the stored Router was created by createRouter<T>(), which
  // returns Router<T> at the type level. The generic T only narrows navigate()
  // at compile time — at runtime, the router is identical regardless of T.
  return router as Router<T>;
}

export function useParams<TPath extends string = string>(): ExtractParams<TPath> {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('useParams() must be called within RouterContext.Provider');
  }
  return (router.current.value?.params ?? {}) as ExtractParams<TPath>;
}
