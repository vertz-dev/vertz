/**
 * Router navigation API.
 *
 * Creates a router instance with reactive current route state,
 * navigation, and revalidation.
 */

import { signal } from '../runtime/signal';
import type { Signal } from '../runtime/signal-types';
import { getSSRContext } from '../ssr/ssr-render-context';
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
  /** Resolves when the first SSE event of any type arrives. */
  firstEvent?: Promise<void>;
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
 * @param initialUrl - The initial URL to match (optional; auto-detects from window.location or SSR context)
 * @returns Router instance with reactive state and navigation methods
 */
export function createRouter<T extends Record<string, RouteConfigLike> = RouteDefinitionMap>(
  routes: TypedRoutes<T>,
  initialUrl?: string,
  options?: RouterOptions,
): Router<T> {
  // Auto-detect SSR context
  const ssrCtx = getSSRContext();
  const isSSR = ssrCtx !== undefined;

  // In SSR or non-browser environments, return a lightweight read-only router.
  // This avoids shared signal corruption across concurrent SSR renders,
  // and prevents crashes when createRouter() is called in Bun tests
  // without an active SSR context.
  if (isSSR || typeof window === 'undefined') {
    const ssrUrl = initialUrl ?? ssrCtx?.url ?? '/';
    const match = matchRoute(routes, ssrUrl);
    return {
      current: { value: match, peek: () => match, notify() {} } as Signal<RouteMatch | null>,
      searchParams: {
        value: match?.search ?? {},
        peek: () => match?.search ?? {},
        notify() {},
      } as Signal<Record<string, unknown>>,
      loaderData: { value: [], peek: () => [], notify() {} } as Signal<unknown[]>,
      loaderError: { value: null, peek: () => null, notify() {} } as Signal<Error | null>,
      navigate: () => Promise.resolve(),
      revalidate: () => Promise.resolve(),
      dispose: () => {},
    } as Router<T>;
  }

  // Determine the initial URL (browser only)
  const url = initialUrl ?? window.location.pathname + window.location.search;

  const initialMatch = matchRoute(routes, url);

  // ── Visited URL tracking for cache-first navigation ──
  // When navigating to a URL that was already visited, skip the SSE
  // wait entirely so cached query data renders instantly. The SSE
  // prefetch still fires in the background for SWR revalidation.
  function normalizeUrl(rawUrl: string): string {
    const qIdx = rawUrl.indexOf('?');
    if (qIdx === -1) return rawUrl;
    const pathname = rawUrl.slice(0, qIdx);
    const params = new URLSearchParams(rawUrl.slice(qIdx + 1));
    params.sort();
    const sorted = params.toString();
    return sorted ? `${pathname}?${sorted}` : pathname;
  }

  const visitedUrls = new Set<string>();
  if (initialMatch) visitedUrls.add(normalizeUrl(url));

  const current = signal<RouteMatch | null>(initialMatch);
  const loaderData = signal<unknown[]>([]);
  const loaderError = signal<Error | null>(null);
  const searchParams = signal<Record<string, unknown>>(initialMatch?.search ?? {});

  /** Navigation generation counter for stale-loader detection (inside applyNavigation). */
  let navigationGen = 0;
  /** Separate counter for the outer navigate() race (awaitPrefetch → applyNavigation). */
  let navigateGen = 0;
  /** AbortController for the current in-flight navigation. */
  let currentAbort: AbortController | null = null;

  // -- Server nav prefetch setup --
  const serverNavEnabled = !!options?.serverNav;
  const serverNavTimeout =
    typeof options?.serverNav === 'object' ? options.serverNav.timeout : undefined;
  const prefetchFn = options?._prefetchNavData ?? (serverNavEnabled ? realPrefetchNavData : null);
  let activePrefetch: PrefetchHandle | null = null;
  let activePrefetchUrl: string | null = null;

  function startPrefetch(navUrl: string): PrefetchHandle | null {
    if (!serverNavEnabled || !prefetchFn) return null;
    // Reuse existing prefetch when navigating to the same URL (re-click)
    const normalized = normalizeUrl(navUrl);
    if (activePrefetch && activePrefetchUrl === normalized) {
      return activePrefetch;
    }
    // Abort previous prefetch for a different URL
    if (activePrefetch) {
      activePrefetch.abort();
    }
    const prefetchOpts: { timeout?: number } = {};
    if (serverNavTimeout !== undefined) {
      prefetchOpts.timeout = serverNavTimeout;
    }
    activePrefetch = prefetchFn(navUrl, prefetchOpts);
    activePrefetchUrl = normalized;
    return activePrefetch;
  }

  /** Wait for first prefetch event (or full completion), with a threshold timeout. */
  async function awaitPrefetch(handle: PrefetchHandle | null): Promise<void> {
    const target = handle?.firstEvent ?? handle?.done;
    if (!target) return;
    await Promise.race([target, new Promise<void>((r) => setTimeout(r, DEFAULT_NAV_THRESHOLD_MS))]);
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
      visitedUrls.add(normalizeUrl(url));
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
    // Capture generation at start — if a newer navigate() starts while we
    // await prefetch, this navigate should skip applyNavigation.
    const gen = ++navigateGen;

    // Start server nav prefetch before navigation
    const handle = startPrefetch(navUrl);

    // Update browser history
    if (navOptions?.replace) {
      window.history.replaceState(null, '', navUrl);
    } else {
      window.history.pushState(null, '', navUrl);
    }

    // Skip SSE wait for previously visited URLs — query cache will
    // serve data instantly. SSE prefetch still fires for SWR revalidation.
    const isCachedNav = visitedUrls.has(normalizeUrl(navUrl));
    if (!isCachedNav && (handle?.firstEvent || handle?.done)) {
      await awaitPrefetch(handle);
    }

    // Guard: skip if a newer navigation started while we waited
    if (gen !== navigateGen) return;

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

  // Listen for popstate (back/forward browser buttons)
  const onPopState = () => {
    const popUrl = window.location.pathname + window.location.search;
    startPrefetch(popUrl);
    applyNavigation(popUrl).catch(() => {
      // Error is stored in loaderError signal
    });
  };
  window.addEventListener('popstate', onPopState);

  function dispose(): void {
    window.removeEventListener('popstate', onPopState);
    if (currentAbort) {
      currentAbort.abort();
    }
    if (activePrefetch) {
      activePrefetch.abort();
      activePrefetch = null;
      activePrefetchUrl = null;
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
