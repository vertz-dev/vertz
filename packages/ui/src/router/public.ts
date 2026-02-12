/**
 * @vertz/ui/router — Public subpath barrel.
 *
 * Only the curated public API is exported here.
 * Internal symbols (matchRoute, executeLoaders, matchPath) live in
 * @vertz/ui/internals or the internal barrel (./index.ts).
 */

export type {
  CompiledRoute,
  LoaderData,
  MatchedRoute,
  RouteConfig,
  RouteDefinitionMap,
  RouteMatch,
  SearchParamSchema,
} from './define-routes';
export { defineRoutes } from './define-routes';
export type { LinkProps } from './link';
export { createLink } from './link';
export type { NavigateOptions, Router } from './navigate';
export { createRouter } from './navigate';
export type { OutletContext } from './outlet';
export { createOutlet } from './outlet';
export type { ExtractParams } from './params';
export { parseSearchParams, useSearchParams } from './search-params';
