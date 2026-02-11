/**
 * Router navigation API.
 *
 * Creates a router instance with reactive current route state,
 * navigation, and revalidation.
 */

import { signal } from '../runtime/signal';
import type { Signal } from '../runtime/signal-types';
import type { CompiledRoute, RouteMatch } from './define-routes';
import { matchRoute } from './define-routes';
import { executeLoaders } from './loader';
import { parseSearchParams } from './search-params';

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
  /** Navigate to a new URL path. */
  navigate: (url: string, options?: NavigateOptions) => Promise<void>;
  /** Re-run all loaders for the current route. */
  revalidate: () => Promise<void>;
}

/**
 * Create a router instance.
 *
 * @param routes - Compiled route list from defineRoutes()
 * @param initialUrl - The initial URL to match
 * @returns Router instance with reactive state and navigation methods
 */
export function createRouter(routes: CompiledRoute[], initialUrl: string): Router {
  const initialMatch = matchRoute(routes, initialUrl);

  const current = signal<RouteMatch | null>(initialMatch);
  const loaderData = signal<unknown[]>([]);
  const loaderError = signal<Error | null>(null);

  // Run initial loaders
  if (initialMatch) {
    runLoaders(initialMatch).catch(() => {
      // Error is stored in loaderError signal
    });
  }

  async function runLoaders(match: RouteMatch): Promise<void> {
    try {
      loaderError.value = null;
      const results = await executeLoaders(match.matched, match.params);
      loaderData.value = results;
    } catch (err: unknown) {
      loaderError.value = err instanceof Error ? err : new Error(String(err));
    }
  }

  async function navigate(url: string, options?: NavigateOptions): Promise<void> {
    const match = matchRoute(routes, url);
    current.value = match;

    if (match) {
      // Apply search params schema
      if (match.route.searchParams) {
        match.search = parseSearchParams(match.searchParams, match.route.searchParams) as Record<
          string,
          unknown
        >;
      }

      // Update browser history
      if (options?.replace) {
        window.history.replaceState(null, '', url);
      } else {
        window.history.pushState(null, '', url);
      }

      await runLoaders(match);
    } else {
      loaderData.value = [];
      loaderError.value = null;
      if (options?.replace) {
        window.history.replaceState(null, '', url);
      } else {
        window.history.pushState(null, '', url);
      }
    }
  }

  async function revalidate(): Promise<void> {
    const match = current.value;
    if (match) {
      await runLoaders(match);
    }
  }

  return {
    current,
    loaderData,
    loaderError,
    navigate,
    revalidate,
  };
}
