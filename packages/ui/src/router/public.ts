/**
 * @vertz/ui/router — Public subpath barrel.
 *
 * Only the curated public API is exported here.
 * Internal symbols (matchRoute, executeLoaders, matchPath) live in
 * @vertz/ui/internals or the internal barrel (./index.ts).
 */

export type {
  CompiledRoute,
  InferRouteMap,
  LoaderData,
  MatchedRoute,
  RouteConfig,
  RouteDefinitionMap,
  RouteMatch,
  SearchParamSchema,
  TypedRoutes,
} from './define-routes';
export { defineRoutes } from './define-routes';
export type { LinkProps } from './link';
export { createLink } from './link';
export type { NavigateOptions, Router, TypedRouter } from './navigate';
export { createRouter } from './navigate';
export type { OutletContext } from './outlet';
export { createOutlet } from './outlet';
export type { ExtractParams, PathWithParams, RoutePaths } from './params';
export { RouterContext, useParams, useRouter } from './router-context';
export type { RouterViewProps } from './router-view';
export { RouterView } from './router-view';
export { parseSearchParams, useSearchParams } from './search-params';
