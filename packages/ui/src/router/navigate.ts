/**
 * Router navigation API.
 *
 * Creates a router instance with reactive current route state,
 * navigation, and revalidation.
 */

import { isBrowser } from '../env/is-browser';
import { signal } from '../runtime/signal';
import type { Signal } from '../runtime/signal-types';
import { getSSRContext } from '../ssr/ssr-render-context';
import type {
  CompiledRoute,
  RouteConfigLike,
  RouteDefinitionMap,
  RouteMatch,
  TypedRoutes,
} from './define-routes';
import { matchRoute } from './define-routes';
import { executeLoaders } from './loader';
import type { ExtractParams, RoutePattern } from './params';
import { prefetchNavData as realPrefetchNavData } from './server-nav';

export type NavigateSearchValue = string | number | boolean | null | undefined;
export type NavigateSearch =
  | string
  | URLSearchParams
  | Record<string, NavigateSearchValue | readonly NavigateSearchValue[]>;

/** Options for router.navigate(). */
export interface NavigateOptions {
  /** Use history.replaceState instead of pushState. */
  replace?: boolean;
  /** Route params used to interpolate dynamic segments in the route pattern. */
  params?: Record<string, string>;
  /** Search params appended to the final URL. */
  search?: NavigateSearch;
}

type NavigateOptionsFor<TPath extends string> = string extends TPath
  ? NavigateOptions
  : TPath extends `${string}:${string}` | `${string}*`
    ? Omit<NavigateOptions, 'params'> & { params: ExtractParams<TPath> }
    : Omit<NavigateOptions, 'params'> & { params?: never };

export type NavigateInput<TPath extends string = string> = {
  to: TPath;
} & NavigateOptionsFor<TPath>;

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
 * accepts any string in `navigate().to`.
 *
 * Method syntax on `navigate`, `revalidate`, and `dispose` enables bivariant
 * parameter checking under `strictFunctionTypes`. This means `Router<T>` is
 * assignable to `Router` (the unparameterized default), which is required for
 * storing typed routers in the `RouterContext` without contravariance errors.
 * At call sites, TypeScript still enforces the `RoutePattern<T>` constraint and
 * the params required for each route pattern.
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
  /** Navigate to a route pattern, interpolating params and search into the final URL. */
  navigate<TPath extends RoutePattern<T>>(input: NavigateInput<TPath>): Promise<void>;
  /** Navigate to a URL path (string shorthand, bypasses typed route validation). */
  navigate(url: string): Promise<void>;
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

function interpolatePath(path: string, params?: Record<string, string>): string {
  const segments = path.split('/');

  return segments
    .map((segment) => {
      if (segment.startsWith(':')) {
        const paramName = segment.slice(1);
        const value = params?.[paramName];
        if (value === undefined) {
          throw new TypeError(`Missing route param "${paramName}" for path "${path}"`);
        }
        return encodeURIComponent(value);
      }

      if (segment === '*') {
        const value = params?.['*'];
        if (value === undefined) {
          throw new TypeError(`Missing wildcard param "*" for path "${path}"`);
        }
        return value
          .replace(/^\/+|\/+$/g, '')
          .split('/')
          .map((part) => encodeURIComponent(part))
          .join('/');
      }

      return segment;
    })
    .join('/');
}

function buildSearch(search?: NavigateSearch): string {
  if (!search) return '';

  if (typeof search === 'string') {
    if (search === '') return '';
    return search.startsWith('?') ? search : `?${search}`;
  }

  const params =
    search instanceof URLSearchParams ? new URLSearchParams(search) : new URLSearchParams();

  if (!(search instanceof URLSearchParams)) {
    const entries = Object.entries(search).sort(([left], [right]) => left.localeCompare(right));
    for (const [key, rawValue] of entries) {
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      for (const value of values) {
        if (value === undefined || value === null) continue;
        params.append(key, String(value));
      }
    }
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

function buildNavigationUrl(to: string, options?: NavigateOptions): string {
  return `${interpolatePath(to, options?.params)}${buildSearch(options?.search)}`;
}

/**
 * Create a router instance.
 *
 * @param routes - Compiled route list from defineRoutes()
 * @param initialUrl - The initial URL to match (optional; auto-detects from window.location or SSR context)
 * @returns Router instance with reactive state and navigation methods
 */
export function createRouter<T extends Record<string, RouteConfigLike> = RouteDefinitionMap>(
  routes: TypedRoutes<T>,
  initialUrl: string,
  options?: RouterOptions,
): Router<T>;
export function createRouter<T extends Record<string, RouteConfigLike> = RouteDefinitionMap>(
  routes: TypedRoutes<T>,
  options?: RouterOptions,
): Router<T>;
export function createRouter<T extends Record<string, RouteConfigLike> = RouteDefinitionMap>(
  routes: TypedRoutes<T>,
  initialUrlOrOptions?: string | RouterOptions,
  maybeOptions?: RouterOptions,
): Router<T> {
  const initialUrl = typeof initialUrlOrOptions === 'string' ? initialUrlOrOptions : undefined;
  const options = typeof initialUrlOrOptions === 'object' ? initialUrlOrOptions : maybeOptions;
  // Auto-detect SSR context
  const ssrCtx = getSSRContext();
  // In SSR or non-browser environments, return a lightweight read-only router.
  // This avoids shared signal corruption across concurrent SSR renders,
  // and prevents crashes when createRouter() is called in Bun tests
  // without an active SSR context.
  //
  // The current/searchParams use SSR-aware getters so that module-level
  // routers (created once at import time) return per-request route matches
  // when accessed inside ssrStorage.run() during SSR rendering.
  //
  // Route discovery is deferred to getter access (not module-level) because
  // createRouter() may run at import time, outside any SSR context. The
  // getters run during rendering, inside ssrStorage.run(), where the context
  // is available.
  if (!isBrowser()) {
    const ssrUrl = initialUrl ?? ssrCtx?.url ?? '/';
    const fallbackMatch = matchRoute(routes, ssrUrl);

    /** Register route patterns with SSR context for build-time discovery. */
    function registerRoutesForDiscovery(ctx: NonNullable<typeof ssrCtx>): void {
      if (!ctx.discoveredRoutes) {
        ctx.discoveredRoutes = collectRoutePatterns(routes);
      }
    }

    return {
      current: {
        get value(): RouteMatch | null {
          const ctx = getSSRContext();
          if (ctx) {
            registerRoutesForDiscovery(ctx);
            return matchRoute(routes, ctx.url);
          }
          return fallbackMatch;
        },
        peek(): RouteMatch | null {
          const ctx = getSSRContext();
          if (ctx) {
            registerRoutesForDiscovery(ctx);
            return matchRoute(routes, ctx.url);
          }
          return fallbackMatch;
        },
        notify() {},
      } as Signal<RouteMatch | null>,
      searchParams: {
        get value(): Record<string, unknown> {
          const ctx = getSSRContext();
          if (ctx) {
            const m = matchRoute(routes, ctx.url);
            return m?.search ?? {};
          }
          return fallbackMatch?.search ?? {};
        },
        peek(): Record<string, unknown> {
          const ctx = getSSRContext();
          if (ctx) {
            const m = matchRoute(routes, ctx.url);
            return m?.search ?? {};
          }
          return fallbackMatch?.search ?? {};
        },
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

  const _current = signal<RouteMatch | null>(initialMatch);
  const loaderData = signal<unknown[]>([]);
  const loaderError = signal<Error | null>(null);
  const _searchParams = signal<Record<string, unknown>>(initialMatch?.search ?? {});

  // SSR-aware proxies: module-level routers created outside SSR context
  // need to return the per-request URL match when accessed during SSR.
  // In the browser, these just delegate to the underlying signals.
  const current = {
    get value(): RouteMatch | null {
      const ctx = getSSRContext();
      if (ctx) {
        if (!ctx.discoveredRoutes) {
          ctx.discoveredRoutes = collectRoutePatterns(routes);
        }
        return matchRoute(routes, ctx.url);
      }
      return _current.value;
    },
    set value(v: RouteMatch | null) {
      _current.value = v;
    },
    peek(): RouteMatch | null {
      const ctx = getSSRContext();
      if (ctx) {
        if (!ctx.discoveredRoutes) {
          ctx.discoveredRoutes = collectRoutePatterns(routes);
        }
        return matchRoute(routes, ctx.url);
      }
      return _current.peek();
    },
    notify() {
      _current.notify();
    },
  } as Signal<RouteMatch | null>;
  const searchParams = {
    get value(): Record<string, unknown> {
      const ctx = getSSRContext();
      if (ctx) {
        const match = matchRoute(routes, ctx.url);
        return match?.search ?? {};
      }
      return _searchParams.value;
    },
    set value(v: Record<string, unknown>) {
      _searchParams.value = v;
    },
    peek(): Record<string, unknown> {
      const ctx = getSSRContext();
      if (ctx) {
        const match = matchRoute(routes, ctx.url);
        return match?.search ?? {};
      }
      return _searchParams.peek();
    },
    notify() {
      _searchParams.notify();
    },
  } as Signal<Record<string, unknown>>;

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

  async function navigate(input: NavigateInput | string): Promise<void> {
    const resolved: NavigateInput = typeof input === 'string' ? { to: input } : input;
    const navUrl = buildNavigationUrl(resolved.to, resolved);

    // Capture generation at start — if a newer navigate() starts while we
    // await prefetch, this navigate should skip applyNavigation.
    const gen = ++navigateGen;

    // Start server nav prefetch before navigation
    const handle = startPrefetch(navUrl);

    // Update browser history
    if (resolved.replace) {
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

  // Cast is safe: the generic only narrows the route pattern and params shape
  // at the type level. At runtime, navigate receives plain strings and objects.
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

/** Recursively collect all route patterns, concatenating parent + child paths. */
function collectRoutePatterns(routes: CompiledRoute[], prefix = ''): string[] {
  const patterns: string[] = [];
  for (const route of routes) {
    const fullPattern = joinPatterns(prefix, route.pattern);
    patterns.push(fullPattern);
    if (route.children) {
      patterns.push(...collectRoutePatterns(route.children, fullPattern));
    }
  }
  return patterns;
}

/** Join parent and child route patterns, handling trailing/leading slashes. */
function joinPatterns(parent: string, child: string): string {
  if (!parent || parent === '/') return child;
  if (child === '/') return parent;
  return `${parent.replace(/\/$/, '')}/${child.replace(/^\//, '')}`;
}
