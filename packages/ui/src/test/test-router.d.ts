/**
 * Router testing helper for Vertz UI.
 *
 * Creates a router instance with given routes and an initial path,
 * returning the rendered component and navigation helpers.
 */
import type { RouteDefinitionMap } from '../router/define-routes';
import type { Router } from '../router/navigate';
/** Options for `createTestRouter`. */
export interface TestRouterOptions {
  /** The initial URL path to navigate to (default "/"). */
  initialPath?: string;
}
/** Result returned by `createTestRouter`. */
export interface TestRouterResult {
  /** A container element that holds the route's rendered component. */
  component: Element;
  /** The underlying router instance. */
  router: Router;
  /** Navigate to a new path (wraps router.navigate). */
  navigate: (path: string) => Promise<void>;
}
/**
 * Create a test router with the given route definitions.
 *
 * The router is initialized at `initialPath` (default "/") and the
 * matched route's component is resolved and returned in `component`.
 *
 * @example
 * ```ts
 * const { component, router, navigate } = await createTestRouter({
 *   '/': { component: () => { const el = document.createElement('div'); el.textContent = 'Home'; return el; } },
 *   '/about': { component: () => { const el = document.createElement('div'); el.textContent = 'About'; return el; } },
 * });
 * ```
 */
export declare function createTestRouter(
  routes: RouteDefinitionMap,
  opts?: TestRouterOptions,
): Promise<TestRouterResult>;
//# sourceMappingURL=test-router.d.ts.map
