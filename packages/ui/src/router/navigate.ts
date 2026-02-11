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
 * @param initialUrl - The initial URL to match
 * @returns Router instance with reactive state and navigation methods
 */
export function createRouter(routes: CompiledRoute[], initialUrl: string): Router {
  const initialMatch = matchRoute(routes, initialUrl);

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
    // Update browser history
    if (options?.replace) {
      window.history.replaceState(null, '', url);
    } else {
      window.history.pushState(null, '', url);
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

  // Listen for popstate (back/forward browser buttons)
  function onPopState(): void {
    const url = window.location.pathname + window.location.search;
    applyNavigation(url).catch(() => {
      // Error is stored in loaderError signal
    });
  }

  window.addEventListener('popstate', onPopState);

  function dispose(): void {
    window.removeEventListener('popstate', onPopState);
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
  };
}
