/**
 * Route path matching with `:param` and `*` wildcard support.
 */
/** Result of a successful route match. */
export interface MatchResult {
  /** Extracted parameters from the path. */
  params: Record<string, string>;
  /** The matched portion of the URL path. */
  path: string;
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
export declare function matchPath(pattern: string, path: string): MatchResult | null;
//# sourceMappingURL=matcher.d.ts.map
