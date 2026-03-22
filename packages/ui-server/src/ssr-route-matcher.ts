/**
 * SSR route matcher — matches URLs to manifest route patterns.
 *
 * Used by the single-pass SSR pipeline to look up which components
 * and queries are expected for a given URL, enabling entity access
 * filtering before discovery-only execution.
 */

export interface MatchedRoute {
  /** The matched route pattern (e.g., '/projects/:projectId/board') */
  pattern: string;
  /** Extracted route parameter values (e.g., { projectId: 'abc123' }) */
  params: Record<string, string>;
}

/**
 * Match a URL path against a list of route patterns.
 * Returns all matching patterns (layouts + page) ordered from most general to most specific.
 *
 * Patterns use Express-style `:param` syntax.
 */
export function matchUrlToPatterns(url: string, patterns: string[]): MatchedRoute[] {
  // Strip query string and hash
  const path = (url.split('?')[0] ?? '').split('#')[0] ?? '';
  const matches: MatchedRoute[] = [];

  for (const pattern of patterns) {
    const result = matchPattern(path, pattern);
    if (result) {
      matches.push(result);
    }
  }

  // Sort by specificity: fewer segments first (layouts before pages)
  matches.sort((a, b) => {
    const aSegments = a.pattern.split('/').length;
    const bSegments = b.pattern.split('/').length;
    return aSegments - bSegments;
  });

  return matches;
}

/**
 * Match a single URL path against a route pattern.
 * Returns the match with extracted params, or undefined if no match.
 */
function matchPattern(path: string, pattern: string): MatchedRoute | undefined {
  const pathSegments = path.split('/').filter(Boolean);
  const patternSegments = pattern.split('/').filter(Boolean);

  // Pattern segments must match path segments exactly in count
  // (unless the pattern is a prefix — handled by the caller collecting all matches)
  if (patternSegments.length > pathSegments.length) return undefined;

  const params: Record<string, string> = {};

  for (let i = 0; i < patternSegments.length; i++) {
    const seg = patternSegments[i] as string;
    const val = pathSegments[i] as string;

    if (seg.startsWith(':')) {
      params[seg.slice(1)] = val;
    } else if (seg !== val) {
      return undefined;
    }
  }

  return { pattern, params };
}
