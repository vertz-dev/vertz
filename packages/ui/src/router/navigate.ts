/**
 * Router navigation API.
 *
 * Creates a router instance with reactive current route state,
 * navigation, and revalidation.
 */

import { signal } from '../runtime/signal';
import type { Signal } from '../runtime/signal-types';
import type { RouteConfigLike, RouteDefinitionMap, RouteMatch, TypedRoutes } from './define-routes';
import { matchRoute } from './define-routes';
import { executeLoaders } from './loader';
import type { RoutePaths } from './params';

/** Options for router.navigate(). */
export interface NavigateOptions {
  /** Use history.replaceState instead of pushState. */
  replace?: boolean;
}

/**
 * The router instance returned by createRouter.
 *
 * Generic over the route map `T`. Defaults to `RouteDefinitionMap` (string
 * index signature) for backward compatibility — unparameterized `Router`
 * accepts any string in `navigate()`.
 *
 * Method syntax on `navigate`, `revalidate`, and `dispose` enables bivariant
 * parameter checking under `strictFunctionTypes`. This means `Router<T>` is
 * assignable to `Router` (the unparameterized default), which is required for
 * storing typed routers in the `RouterContext` without contravariance errors.
 * At call sites, TypeScript still enforces the `RoutePaths<T>` constraint.
 */
export interface Router<T extends Record<string, RouteConfigLike> = RouteDefinitionMap> {
  /** Current matched route (reactive signal). */
  current: Signal<RouteMatch | null>;
  /** Loader data from the current route's loaders (reactive signal). */
  loaderData: Signal<unknown[]>;
  /** Loader error if any loader threw (reactive signal). */
  loaderError: Signal<Error | null>;
  /** Parsed search params from the current route (reactive signal). */
  searchParams: Signal<Record<string, unknown>>;
  /** Navigate to a new URL path. */
  navigate(url: RoutePaths<T>, options?: NavigateOptions): Promise<void>;
  /** Re-run all loaders for the current route. */
  revalidate(): Promise<void>;
  /** Remove popstate listener and clean up the router. */
  dispose(): void;
}

/**
 * Convenience alias for a typed router.
 * `TypedRouter<T>` is identical to `Router<T>` — it exists for readability
 * when the generic parameter makes the intent clearer.
 */
export type TypedRouter<T extends Record<string, RouteConfigLike> = RouteDefinitionMap> = Router<T>;

/**
 * Create a router instance.
 *
 * @param routes - Compiled route list from defineRoutes()
 * @param initialUrl - The initial URL to match (optional; auto-detects from window.location or __SSR_URL__)
 * @returns Router instance with reactive state and navigation methods
 */
export function createRouter<T extends Record<string, RouteConfigLike> = RouteDefinitionMap>(
  routes: TypedRoutes<T>,
  initialUrl?: string,
): Router<T> {
  // Auto-detect SSR context
  const isSSR = typeof window === 'undefined' || typeof globalThis.__SSR_URL__ !== 'undefined';

  // Determine the initial URL
  let url: string;
  if (initialUrl) {
    url = initialUrl;
  } else if (isSSR) {
    // In SSR, use the __SSR_URL__ global set by the SSR entry
    url = globalThis.__SSR_URL__ || '/';
  } else {
    // In browser, use window.location
    url = window.location.pathname + window.location.search;
  }

  const initialMatch = matchRoute(routes, url);

  const current = signal<RouteMatch | null>(initialMatch);
  const loaderData = signal<unknown[]>([]);
  const loaderError = signal<Error | null>(null);
  const searchParams = signal<Record<string, unknown>>(initialMatch?.search ?? {});

  /** Navigation generation counter for stale-loader detection. */
  let navigationGen = 0;
  /** AbortController for the current in-flight navigation. */
  let currentAbort: AbortController | null = null;

  // Run initial loaders
  if (initialMatch) {
    const gen = ++navigationGen;
    const abort = new AbortController();
    currentAbort = abort;
    runLoaders(initialMatch, gen, abort.signal).catch(() => {
      // Error is stored in loaderError signal
    });
  }

  async function runLoaders(
    match: RouteMatch,
    gen: number,
    abortSignal: AbortSignal,
  ): Promise<void> {
    try {
      loaderError.value = null;
      const results = await executeLoaders(match.matched, match.params, abortSignal);
      // Only apply if this is still the current navigation
      if (gen === navigationGen) {
        loaderData.value = results;
      }
    } catch (err: unknown) {
      if (gen === navigationGen) {
        loaderError.value = err instanceof Error ? err : new Error(String(err));
      }
    }
  }

  async function applyNavigation(url: string): Promise<void> {
    // Abort any in-flight navigation
    if (currentAbort) {
      currentAbort.abort();
    }

    const gen = ++navigationGen;
    const abort = new AbortController();
    currentAbort = abort;

    const match = matchRoute(routes, url);
    current.value = match;

    if (match) {
      searchParams.value = match.search;
      await runLoaders(match, gen, abort.signal);
    } else {
      searchParams.value = {};
      if (gen === navigationGen) {
        loaderData.value = [];
        loaderError.value = null;
      }
    }
  }

  async function navigate(url: string, options?: NavigateOptions): Promise<void> {
    // Update browser history (skip in SSR)
    if (!isSSR) {
      if (options?.replace) {
        window.history.replaceState(null, '', url);
      } else {
        window.history.pushState(null, '', url);
      }
    }

    await applyNavigation(url);
  }

  async function revalidate(): Promise<void> {
    const match = current.value;
    if (match) {
      // Abort any in-flight navigation
      if (currentAbort) {
        currentAbort.abort();
      }
      const gen = ++navigationGen;
      const abort = new AbortController();
      currentAbort = abort;
      await runLoaders(match, gen, abort.signal);
    }
  }

  // Listen for popstate (back/forward browser buttons) — skip in SSR
  let onPopState: (() => void) | null = null;

  if (!isSSR) {
    onPopState = () => {
      const url = window.location.pathname + window.location.search;
      applyNavigation(url).catch(() => {
        // Error is stored in loaderError signal
      });
    };
    window.addEventListener('popstate', onPopState);
  }

  function dispose(): void {
    if (onPopState) {
      window.removeEventListener('popstate', onPopState);
    }
    if (currentAbort) {
      currentAbort.abort();
    }
  }

  return {
    current,
    dispose,
    loaderData,
    loaderError,
    navigate,
    revalidate,
    searchParams,
  } as Router<T>;
}
