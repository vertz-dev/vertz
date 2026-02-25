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
import { prefetchNavData as realPrefetchNavData } from './server-nav';

/** Options for router.navigate(). */
export interface NavigateOptions {
  /** Use history.replaceState instead of pushState. */
  replace?: boolean;
}

/** Handle returned by prefetchNavData for cancellation. */
interface PrefetchHandle {
  abort: () => void;
  /** Resolves when SSE stream completes (data or done event). */
  done?: Promise<void>;
}

/**
 * Default threshold (ms) to wait for SSE data before rendering the page.
 *
 * In dev, the Vite server needs ~200-500ms for module invalidation + SSR
 * compilation. In production with pre-built modules, responses are much
 * faster. 500ms covers the dev case without making navigation feel sluggish
 * (the URL updates immediately via pushState, giving instant feedback).
 */
const DEFAULT_NAV_THRESHOLD_MS = 500;

/** Options for createRouter(). */
export interface RouterOptions {
  /** Enable server-side navigation pre-fetch. When true, uses default timeout. */
  serverNav?: boolean | { timeout?: number };
  /** @internal — injected for testing. Production uses the real module. */
  _prefetchNavData?: (url: string, options?: { timeout?: number }) => PrefetchHandle;
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
  options?: RouterOptions,
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

  // -- Server nav prefetch setup --
  const serverNavEnabled = !!options?.serverNav;
  const serverNavTimeout =
    typeof options?.serverNav === 'object' ? options.serverNav.timeout : undefined;
  const prefetchFn = options?._prefetchNavData ?? (serverNavEnabled ? realPrefetchNavData : null);
  let activePrefetch: PrefetchHandle | null = null;

  function startPrefetch(navUrl: string): PrefetchHandle | null {
    if (!serverNavEnabled || !prefetchFn) return null;
    // Abort previous prefetch
    if (activePrefetch) {
      activePrefetch.abort();
    }
    const prefetchOpts: { timeout?: number } = {};
    if (serverNavTimeout !== undefined) {
      prefetchOpts.timeout = serverNavTimeout;
    }
    activePrefetch = prefetchFn(navUrl, prefetchOpts);
    return activePrefetch;
  }

  /** Wait for prefetch to complete, with a threshold timeout. */
  async function awaitPrefetch(handle: PrefetchHandle | null): Promise<void> {
    if (!handle?.done) return;
    await Promise.race([
      handle.done,
      new Promise<void>((r) => setTimeout(r, DEFAULT_NAV_THRESHOLD_MS)),
    ]);
  }

  // In SSR, register a sync hook so the SSR pipeline can navigate
  // module-level routers to the current request URL before each render.
  // Without this, routers created at module import time (before __SSR_URL__
  // is set) remain stuck on their initial URL for all subsequent renders.
  if (isSSR) {
    // biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
    const g = globalThis as any;
    const prev = g.__VERTZ_SSR_SYNC_ROUTER__;
    g.__VERTZ_SSR_SYNC_ROUTER__ = (ssrUrl: string) => {
      // Chain: call previously registered routers first
      if (typeof prev === 'function') prev(ssrUrl);
      const match = matchRoute(routes, ssrUrl);
      current.value = match;
      searchParams.value = match?.search ?? {};
    };
  }

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

  async function navigate(navUrl: string, navOptions?: NavigateOptions): Promise<void> {
    // Start server nav prefetch before navigation
    const handle = startPrefetch(navUrl);

    // Update browser history (skip in SSR)
    if (!isSSR) {
      if (navOptions?.replace) {
        window.history.replaceState(null, '', navUrl);
      } else {
        window.history.pushState(null, '', navUrl);
      }
    }

    // Wait briefly for SSE data to arrive before rendering the page.
    // If data resolves within the threshold, the page renders with data
    // immediately (no loading flash). Otherwise, render proceeds and
    // data arrives later via the hydration bus.
    // Note: only await when there's a done promise — avoid yielding to
    // the microtask queue unnecessarily (changes execution order of
    // concurrent navigations).
    if (handle?.done) {
      await awaitPrefetch(handle);
    }

    await applyNavigation(navUrl);
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
      const popUrl = window.location.pathname + window.location.search;
      startPrefetch(popUrl);
      applyNavigation(popUrl).catch(() => {
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
    if (activePrefetch) {
      activePrefetch.abort();
      activePrefetch = null;
    }
  }

  // Cast is safe: RoutePaths<T> narrows `string` at the type level only.
  // At runtime, navigate always receives a string regardless of T.
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
