/**
 * Route definition and matching API.
 */
import type { ExtractParams } from './params';
/** Simple schema interface for search param parsing. */
export interface SearchParamSchema<T> {
  parse(data: unknown): T;
}
/** A route configuration for a single path. */
export interface RouteConfig<
  TPath extends string = string,
  TLoaderData = unknown,
  TSearch = unknown,
> {
  /** Component factory (lazy for code splitting). */
  component: () =>
    | Node
    | Promise<{
        default: () => Node;
      }>;
  /** Optional loader that runs before render. */
  loader?: (ctx: {
    params: ExtractParams<TPath>;
    signal: AbortSignal;
  }) => Promise<TLoaderData> | TLoaderData;
  /** Optional error component rendered when loader throws. */
  errorComponent?: (error: Error) => Node;
  /** Optional search params schema for validation/coercion. */
  searchParams?: SearchParamSchema<TSearch>;
  /** Nested child routes. */
  children?: RouteDefinitionMap;
}
/** A map of path patterns to route configs (user input format). */
export interface RouteDefinitionMap {
  [pattern: string]: RouteConfig;
}
/** Internal compiled route. */
export interface CompiledRoute {
  /** The original path pattern. */
  pattern: string;
  /** The route config. */
  component: RouteConfig['component'];
  loader?: (ctx: {
    params: Record<string, string>;
    signal: AbortSignal;
  }) => Promise<unknown> | unknown;
  errorComponent?: RouteConfig['errorComponent'];
  searchParams?: RouteConfig['searchParams'];
  /** Compiled children. */
  children?: CompiledRoute[];
}
/** A single matched route entry in the matched chain. */
export interface MatchedRoute {
  route: CompiledRoute;
  params: Record<string, string>;
}
/** Result of matching a URL against the route tree. */
export interface RouteMatch {
  /** All params extracted from the full URL path. */
  params: Record<string, string>;
  /** The leaf route config that matched. */
  route: CompiledRoute;
  /** The chain of matched routes from root to leaf (for nested layouts). */
  matched: MatchedRoute[];
  /** URLSearchParams from the URL. */
  searchParams: URLSearchParams;
  /** Parsed/coerced search params if schema is defined. */
  search: Record<string, unknown>;
}
/**
 * Type utility to extract loader return type from a route config.
 */
export type LoaderData<T> = T extends {
  loader: (...args: never[]) => Promise<infer R>;
}
  ? R
  : T extends {
        loader: (...args: never[]) => infer R;
      }
    ? R
    : never;
/**
 * Define routes from a configuration map.
 * Returns an array of compiled routes preserving definition order.
 */
export declare function defineRoutes(map: RouteDefinitionMap): CompiledRoute[];
/**
 * Match a URL path against a list of compiled routes.
 * Supports nested route matching for layouts.
 *
 * @param routes - Compiled route list
 * @param url - URL path (may include query string)
 * @returns RouteMatch or null if no route matches
 */
export declare function matchRoute(routes: CompiledRoute[], url: string): RouteMatch | null;
//# sourceMappingURL=define-routes.d.ts.map
