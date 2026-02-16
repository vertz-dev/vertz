/**
 * Route path matching with `:param` and `*` wildcard support.
 */
/**
 * Parse a URL path into normalized segments.
 * Removes leading/trailing slashes and splits by '/'.
 */
function splitPath(path) {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  if (trimmed === '') return [];
  return trimmed.split('/');
}
/**
 * Match a URL path against a route pattern.
 *
 * - Static segments must match exactly.
 * - `:param` segments capture a single non-empty path segment.
 * - `*` at the end captures all remaining segments (including empty).
 *
 * Returns a MatchResult on success, or null if the path does not match.
 */
export function matchPath(pattern, path) {
  const patternSegments = splitPath(pattern);
  const pathSegments = splitPath(path);
  const params = {};
  for (let i = 0; i < patternSegments.length; i++) {
    const seg = patternSegments[i];
    // Wildcard: captures the rest
    if (seg === '*') {
      params['*'] = pathSegments.slice(i).join('/');
      return { params, path };
    }
    // No more path segments to match against
    if (i >= pathSegments.length) {
      return null;
    }
    const pathSeg = pathSegments[i];
    if (seg.startsWith(':')) {
      // Param segment: must be non-empty
      if (pathSeg === '') return null;
      params[seg.slice(1)] = pathSeg;
    } else {
      // Static segment: must match exactly
      if (seg !== pathSeg) return null;
    }
  }
  // If pattern is exhausted but path has extra segments, no match
  if (pathSegments.length > patternSegments.length) {
    return null;
  }
  return { params, path };
}
//# sourceMappingURL=matcher.js.map
