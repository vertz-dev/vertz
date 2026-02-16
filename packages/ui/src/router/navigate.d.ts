/**
 * Router navigation API.
 *
 * Creates a router instance with reactive current route state,
 * navigation, and revalidation.
 */
import type { Signal } from '../runtime/signal-types';
import type { CompiledRoute, RouteMatch } from './define-routes';
/** Options for router.navigate(). */
export interface NavigateOptions {
  /** Use history.replaceState instead of pushState. */
  replace?: boolean;
}
/** The router instance returned by createRouter. */
export interface Router {
  /** Current matched route (reactive signal). */
  current: Signal<RouteMatch | null>;
  /** Loader data from the current route's loaders (reactive signal). */
  loaderData: Signal<unknown[]>;
  /** Loader error if any loader threw (reactive signal). */
  loaderError: Signal<Error | null>;
  /** Parsed search params from the current route (reactive signal). */
  searchParams: Signal<Record<string, unknown>>;
  /** Navigate to a new URL path. */
  navigate: (url: string, options?: NavigateOptions) => Promise<void>;
  /** Re-run all loaders for the current route. */
  revalidate: () => Promise<void>;
  /** Remove popstate listener and clean up the router. */
  dispose: () => void;
}
/**
 * Create a router instance.
 *
 * @param routes - Compiled route list from defineRoutes()
 * @param initialUrl - The initial URL to match (optional; auto-detects from window.location or __SSR_URL__)
 * @returns Router instance with reactive state and navigation methods
 */
export declare function createRouter(routes: CompiledRoute[], initialUrl?: string): Router;
//# sourceMappingURL=navigate.d.ts.map
