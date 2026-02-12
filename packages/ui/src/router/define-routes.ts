/**
 * Route definition and matching API.
 */

import { matchPath } from './matcher';
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
  component: () => Node | Promise<{ default: () => Node }>;
  /** Optional loader that runs before render. */
  loader?: (ctx: { params: ExtractParams<TPath> }) => Promise<TLoaderData> | TLoaderData;
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
  loader?: RouteConfig['loader'];
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
export type LoaderData<T> = T extends { loader: (...args: never[]) => Promise<infer R> }
  ? R
  : T extends { loader: (...args: never[]) => infer R }
    ? R
    : never;

/**
 * Define routes from a configuration map.
 * Returns an array of compiled routes preserving definition order.
 */
export function defineRoutes(map: RouteDefinitionMap): CompiledRoute[] {
  const routes: CompiledRoute[] = [];

  for (const [pattern, config] of Object.entries(map)) {
    const compiled: CompiledRoute = {
      component: config.component,
      errorComponent: config.errorComponent,
      loader: config.loader,
      pattern,
      searchParams: config.searchParams,
    };

    if (config.children) {
      compiled.children = defineRoutes(config.children);
    }

    routes.push(compiled);
  }

  return routes;
}

/**
 * Match a URL path against a list of compiled routes.
 * Supports nested route matching for layouts.
 *
 * @param routes - Compiled route list
 * @param url - URL path (may include query string)
 * @returns RouteMatch or null if no route matches
 */
export function matchRoute(routes: CompiledRoute[], url: string): RouteMatch | null {
  // Split path and query string
  const [pathname, queryString] = splitUrl(url);
  const searchParams = new URLSearchParams(queryString);

  const matched: MatchedRoute[] = [];
  const allParams: Record<string, string> = {};

  const leaf = matchRouteRecursive(routes, pathname as string, matched, allParams);
  if (!leaf) return null;

  // Parse search params through schema if the leaf route has one
  let search: Record<string, unknown> = {};
  // Walk matched routes to find a searchParams schema
  for (const m of matched) {
    if (m.route.searchParams) {
      const raw: Record<string, string> = {};
      for (const [key, value] of searchParams.entries()) {
        raw[key] = value;
      }
      search = m.route.searchParams.parse(raw) as Record<string, unknown>;
      break;
    }
  }

  return {
    matched,
    params: allParams,
    route: leaf,
    search,
    searchParams,
  };
}

function splitUrl(url: string): [string, string] {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return [url, ''];
  return [url.slice(0, qIndex), url.slice(qIndex + 1)];
}

function matchRouteRecursive(
  routes: CompiledRoute[],
  pathname: string,
  matched: MatchedRoute[],
  allParams: Record<string, string>,
): CompiledRoute | null {
  for (const route of routes) {
    if (route.children && route.children.length > 0) {
      // For parent routes with children, try prefix matching
      const prefixResult = matchPrefix(route.pattern, pathname);
      if (prefixResult) {
        matched.push({ params: prefixResult.params, route });
        Object.assign(allParams, prefixResult.params);

        // Try to match children against the remaining path
        const childResult = matchRouteRecursive(
          route.children,
          prefixResult.remaining,
          matched,
          allParams,
        );
        if (childResult) return childResult;

        // If no child matched, remove parent from matched chain
        matched.pop();
        // Remove parent params
        for (const key of Object.keys(prefixResult.params)) {
          delete allParams[key];
        }
      }
    } else {
      // Leaf route: exact match
      const result = matchPath(route.pattern, pathname);
      if (result) {
        matched.push({ params: result.params, route });
        Object.assign(allParams, result.params);
        return route;
      }
    }
  }

  return null;
}

interface PrefixMatchResult {
  params: Record<string, string>;
  remaining: string;
}

/**
 * Match a route pattern as a prefix of a path.
 * Returns extracted params and the remaining unmatched portion.
 */
function matchPrefix(pattern: string, pathname: string): PrefixMatchResult | null {
  const patternSegments = splitSegments(pattern);
  const pathSegments = splitSegments(pathname);

  if (patternSegments.length > pathSegments.length) return null;

  const params: Record<string, string> = {};

  for (let i = 0; i < patternSegments.length; i++) {
    const pSeg = patternSegments[i] as string;
    const uSeg = pathSegments[i] as string;

    if (pSeg.startsWith(':')) {
      if (uSeg === '') return null;
      params[pSeg.slice(1)] = uSeg;
    } else if (pSeg !== uSeg) {
      return null;
    }
  }

  const remainingSegments = pathSegments.slice(patternSegments.length);
  const remaining = `/${remainingSegments.join('/')}`;

  return { params, remaining };
}

function splitSegments(path: string): string[] {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  if (trimmed === '') return [];
  return trimmed.split('/');
}
