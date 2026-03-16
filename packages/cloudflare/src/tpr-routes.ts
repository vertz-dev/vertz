/**
 * Compiler-assisted route classification for TPR.
 *
 * Classifies routes as static (always pre-render) or dynamic (need traffic data),
 * based on route metadata from the Vertz compiler/router.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal route shape — compatible with CompiledRoute from @vertz/ui. */
export interface RouteInfo {
  pattern: string;
  component: unknown;
  prerender?: boolean;
  generateParams?: () => Promise<Array<Record<string, string>>>;
  children?: RouteInfo[];
}

/** Result of route classification. */
export interface RouteClassification {
  /** Routes that should always be pre-rendered (prerender: true, no :params). */
  static: string[];
  /** Routes that need traffic data to decide (has :params or no explicit prerender). */
  dynamic: string[];
  /** Routes explicitly excluded from pre-rendering (prerender: false). */
  excluded: string[];
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Classify routes for TPR.
 *
 * - `prerender: true` + no `:param` → static (always pre-render)
 * - `prerender: false` → excluded
 * - Everything else → dynamic (use analytics to decide)
 */
export function classifyRoutes(routes: RouteInfo[], prefix = ''): RouteClassification {
  const result: RouteClassification = {
    static: [],
    dynamic: [],
    excluded: [],
  };

  for (const route of routes) {
    const fullPattern = joinPatterns(prefix, route.pattern);
    const hasParams = fullPattern.includes(':') || fullPattern.includes('*');

    if (route.prerender === false) {
      result.excluded.push(fullPattern);
    } else if (route.prerender === true && !hasParams) {
      result.static.push(fullPattern);
    } else {
      result.dynamic.push(fullPattern);
    }

    // Recurse into children
    if (route.children) {
      const childResult = classifyRoutes(route.children, fullPattern);
      result.static.push(...childResult.static);
      result.dynamic.push(...childResult.dynamic);
      result.excluded.push(...childResult.excluded);
    }
  }

  return result;
}

/** Join parent and child route patterns. */
function joinPatterns(parent: string, child: string): string {
  if (!parent || parent === '/') return child.startsWith('/') ? child : `/${child}`;
  if (child === '/' || child === '') return parent;
  const p = parent.replace(/\/$/, '');
  const c = child.replace(/^\//, '');
  return `${p}/${c}`;
}
