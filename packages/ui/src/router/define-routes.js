/**
 * Route definition and matching API.
 */
import { matchPath } from './matcher';
/**
 * Define routes from a configuration map.
 * Returns an array of compiled routes preserving definition order.
 */
export function defineRoutes(map) {
  const routes = [];
  for (const [pattern, config] of Object.entries(map)) {
    const compiled = {
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
export function matchRoute(routes, url) {
  // Split path and query string
  const [pathname, queryString] = splitUrl(url);
  const searchParams = new URLSearchParams(queryString);
  const matched = [];
  const allParams = {};
  const leaf = matchRouteRecursive(routes, pathname, matched, allParams);
  if (!leaf) return null;
  // Parse search params through schema if the leaf route has one
  let search = {};
  // Walk matched routes to find a searchParams schema
  for (const m of matched) {
    if (m.route.searchParams) {
      const raw = {};
      for (const [key, value] of searchParams.entries()) {
        raw[key] = value;
      }
      search = m.route.searchParams.parse(raw);
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
function splitUrl(url) {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return [url, ''];
  return [url.slice(0, qIndex), url.slice(qIndex + 1)];
}
function matchRouteRecursive(routes, pathname, matched, allParams) {
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
/**
 * Match a route pattern as a prefix of a path.
 * Returns extracted params and the remaining unmatched portion.
 */
function matchPrefix(pattern, pathname) {
  const patternSegments = splitSegments(pattern);
  const pathSegments = splitSegments(pathname);
  if (patternSegments.length > pathSegments.length) return null;
  const params = {};
  for (let i = 0; i < patternSegments.length; i++) {
    const pSeg = patternSegments[i];
    const uSeg = pathSegments[i];
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
function splitSegments(path) {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  if (trimmed === '') return [];
  return trimmed.split('/');
}
//# sourceMappingURL=define-routes.js.map
