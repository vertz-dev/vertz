/**
 * Shared SSR utilities.
 *
 * Contains foundational types and helpers used by the single-pass SSR,
 * AOT pipeline, handlers, and pre-rendering. No render functions live here.
 */

import { type CompiledRoute, compileTheme, type FontFallbackMetrics, type Theme } from '@vertz/ui';
import type { SSRRenderContext } from '@vertz/ui/internals';
import { EntityStore, MemoryCache, QueryEnvelopeStore } from '@vertz/ui/internals';
import { createSSRAdapter } from './ssr-adapter';

/**
 * Cache compiled theme results. Theme compilation is deterministic for a
 * given Theme object and fallback metrics combination. We use two cache
 * slots per theme: one without metrics (discovery pass) and one with
 * metrics (pre-render pass). The "with metrics" version is preferred
 * when available.
 *
 * WeakMap ensures automatic cleanup when modules are garbage collected
 * (e.g., dev HMR reloads creating new theme objects).
 */
const compiledThemeCache = new WeakMap<object, ReturnType<typeof compileTheme>>();
const compiledThemeWithMetricsCache = new WeakMap<object, ReturnType<typeof compileTheme>>();

export function compileThemeCached(
  theme: Theme,
  fallbackMetrics?: Record<string, FontFallbackMetrics>,
): ReturnType<typeof compileTheme> {
  const cache = fallbackMetrics ? compiledThemeWithMetricsCache : compiledThemeCache;
  const cached = cache.get(theme);
  if (cached) return cached;

  const compiled = compileTheme(theme, { fallbackMetrics });
  cache.set(theme, compiled);
  return compiled;
}

/** Create a fresh SSRRenderContext for a new request. */
export function createRequestContext(url: string): SSRRenderContext {
  return {
    url,
    adapter: createSSRAdapter(),
    subscriber: null,
    readValueCb: null,
    cleanupStack: [],
    batchDepth: 0,
    pendingEffects: new Map(),
    contextScope: null,
    entityStore: new EntityStore(),
    envelopeStore: new QueryEnvelopeStore(),
    // Per-request cache — no eviction needed; context is discarded after render.
    queryCache: new MemoryCache<unknown>({ maxSize: Infinity }),
    inflight: new Map(),
    queries: [],
    errors: [],
    // Per-request CSS tracker for render-scoped collection
    cssTracker: new Set<string>(),
  };
}

export interface SSRModule {
  default?: () => unknown;
  App?: () => unknown;
  theme?: Theme;
  /** Global CSS strings to include in every SSR response (e.g. resets, body styles). */
  styles?: string[];
  /**
   * Return all CSS tracked by the bundled @vertz/ui instance.
   * The Vite SSR build inlines @vertz/ui into the server bundle, creating
   * a separate module instance from @vertz/ui-server's dependency. Without
   * this, component CSS from module-level css() calls is invisible to the
   * SSR renderer. Export `getInjectedCSS` from @vertz/ui in the app entry.
   */
  getInjectedCSS?: () => string[];
  /** Compiled routes exported from the app for build-time SSG with generateParams. */
  routes?: CompiledRoute[];
  /** Code-generated API client for manifest-driven zero-discovery prefetching. */
  api?: Record<string, Record<string, (...args: unknown[]) => unknown>>;
}

export interface SSRRenderResult {
  html: string;
  css: string;
  ssrData: Array<{ key: string; data: unknown }>;
  /** Font preload link tags for injection into <head>. */
  headTags: string;
  /** Route patterns discovered by createRouter() during SSR (for build-time pre-rendering). */
  discoveredRoutes?: string[];
  /** Route patterns that matched the current URL (for per-route modulepreload). */
  matchedRoutePatterns?: string[];
  /** Set when ProtectedRoute writes a redirect during SSR. Server should return 302. */
  redirect?: { to: string };
}
