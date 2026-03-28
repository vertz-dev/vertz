/**
 * AOT SSR Pipeline
 *
 * Provides `ssrRenderAot()` — a render function that uses pre-compiled
 * string-builder functions instead of the DOM shim. Falls back to
 * `ssrRenderSinglePass()` for routes without AOT entries.
 *
 * Also provides `createHoles()` — closure-based fallback renderers for
 * components that cannot be AOT-compiled.
 */

import type { FontFallbackMetrics } from '@vertz/ui';
import type { SSRAuth } from '@vertz/ui/internals';
import type { ExtractedQuery } from '@vertz/ui-compiler';
import { filterCSSByHTML } from './css-filter';
import { installDomShim, toVNode } from './dom-shim';
import { serializeToHtml } from './html-serializer';
import type { PrefetchSession } from './ssr-access-evaluator';
import type { AotDiagnostics } from './ssr-aot-diagnostics';
import { clearGlobalSSRTimeout, setGlobalSSRTimeout, ssrStorage } from './ssr-context';
import { reconstructDescriptors } from './ssr-manifest-prefetch';
import {
  compileThemeCached,
  createRequestContext,
  type SSRModule,
  type SSRRenderResult,
} from './ssr-render';
import { matchUrlToPatterns } from './ssr-route-matcher';
import { type SSRPrefetchManifest, ssrRenderSinglePass } from './ssr-single-pass';

// ─── Types ──────────────────────────────────────────────────────

/** Context passed to AOT render functions for accessing data and runtime holes. */
export interface SSRAotContext {
  /** Pre-generated closures for runtime-rendered components. */
  holes: Record<string, () => string>;

  /** Access query data by cache key. */
  getData(key: string): unknown;

  /** Auth session for conditional rendering. */
  session: PrefetchSession | undefined;

  /** Route params for the current request. */
  params: Record<string, string>;
}

/** An AOT render function: takes props/data and context, returns HTML string. */
export type AotRenderFn = (data: Record<string, unknown>, ctx: SSRAotContext) => string;

/** Per-route AOT entry in the manifest. */
export interface AotRouteEntry {
  /** The pre-compiled render function. */
  render: AotRenderFn;
  /** Component names that need runtime fallback (holes). */
  holes: string[];
  /** Query cache keys this route reads via ctx.getData(). */
  queryKeys?: string[];
  /** Pre-filtered CSS rules for this route, determined at build time (#1988). */
  css?: string[];
}

/**
 * AOT manifest — maps route patterns to pre-compiled render functions.
 *
 * Generated at build time by the AOT compiler pipeline.
 */
export interface AotManifest {
  /** Route pattern → AOT entry. */
  routes: Record<string, AotRouteEntry>;
  /** Root layout (App) entry — wraps page content via its RouterView hole. */
  app?: AotRouteEntry;
}

/**
 * Resolves custom data for AOT-rendered routes.
 *
 * Called after the entity prefetch pipeline, before the `allKeysResolved` bail check.
 * Only called when there are unresolved query keys remaining.
 *
 * @param pattern - Matched route pattern (e.g., '/products/:id')
 * @param params - Route params (e.g., \{ id: 'abc-123' \})
 * @param unresolvedKeys - Query keys not yet populated by entity prefetch
 * @returns Map of cache key → data, or empty Map to skip
 */
export type AotDataResolver = (
  pattern: string,
  params: Record<string, string>,
  unresolvedKeys: string[],
) => Promise<Map<string, unknown>> | Map<string, unknown>;

/** Options for `ssrRenderAot()`. */
export interface SSRRenderAotOptions {
  /** AOT manifest with pre-compiled render functions. */
  aotManifest: AotManifest;
  /** Prefetch manifest for route matching and data fetching. */
  manifest?: SSRPrefetchManifest;
  /** SSR timeout in ms. */
  ssrTimeout?: number;
  /** Pre-computed font fallback metrics. */
  fallbackMetrics?: Record<string, FontFallbackMetrics>;
  /** Auth state resolved from session cookie. */
  ssrAuth?: SSRAuth;
  /** Session data for access rule evaluation. */
  prefetchSession?: PrefetchSession;
  /** AOT diagnostics collector (dev mode). When provided with VERTZ_DEBUG=aot, enables dual rendering and divergence detection. */
  diagnostics?: AotDiagnostics;
  /** Custom data resolver for non-entity AOT routes. */
  aotDataResolver?: AotDataResolver;
}

// ─── createHoles ─────────────────────────────────────────────────

/**
 * Create closure-based runtime fallback renderers for components
 * that cannot be AOT-compiled.
 *
 * Each hole closure:
 * 1. Runs inside `ssrStorage.run()` to provide SSRRenderContext
 * 2. Calls the component factory via the SSR module
 * 3. Converts the result to VNode and serializes to HTML string
 * 4. Shares the query cache with the AOT function
 *
 * @param holeNames - Component names that need runtime rendering
 * @param module - SSR module with component factories
 * @param url - Request URL for context
 * @param queryCache - Pre-populated query cache (shared with AOT)
 * @param ssrAuth - Auth state for the request
 */
export function createHoles(
  holeNames: string[],
  module: SSRModule,
  url: string,
  queryCache: Map<string, unknown>,
  ssrAuth?: SSRAuth,
): Record<string, () => string> {
  if (holeNames.length === 0) return {};

  const holes: Record<string, () => string> = {};

  for (const name of holeNames) {
    holes[name] = () => {
      // Create a fresh context for the hole render, sharing the query cache
      const holeCtx = createRequestContext(url);

      // Transfer query data so the hole's query() calls hit cache
      for (const [key, data] of queryCache) {
        holeCtx.queryCache.set(key, data);
      }

      if (ssrAuth) {
        holeCtx.ssrAuth = ssrAuth;
      }

      // Initialize resolvedComponents so the render knows it's pass 2
      holeCtx.resolvedComponents = new Map();

      // Run inside ssrStorage context for useContext(), query(), etc.
      return ssrStorage.run(holeCtx, () => {
        ensureDomShim();

        // Resolve the component from the module
        const factory = resolveHoleComponent(module, name);
        if (!factory) {
          return `<!-- AOT hole: ${name} not found -->`;
        }

        const node = factory();
        const vnode = toVNode(node);
        return serializeToHtml(vnode);
      });
    };
  }

  return holes;
}

/**
 * Resolve a component factory from the SSR module by name.
 *
 * Looks for named exports matching the component name.
 * The module is treated as a generic record to access dynamic exports.
 */
function resolveHoleComponent(module: SSRModule, name: string): (() => unknown) | undefined {
  // SSR modules can have arbitrary named exports beyond the typed interface
  const moduleRecord = module as Record<string, unknown>;
  const exported = moduleRecord[name];
  if (typeof exported === 'function') {
    return exported as () => unknown;
  }

  return undefined;
}

// ─── ssrRenderAot ────────────────────────────────────────────────

/**
 * Render a page using pre-compiled AOT string-builder functions.
 *
 * Falls back to `ssrRenderSinglePass()` when:
 * - No route match in the AOT manifest
 * - No prefetch manifest for route matching
 *
 * Pipeline:
 * 1. Match URL to route pattern
 * 2. Look up AOT entry in manifest
 * 3. Prefetch query data (reuses single-pass prefetch logic)
 * 4. Create runtime holes (closures for non-AOT components)
 * 5. Call AOT render function with data + context
 * 6. Collect CSS, ssrData, headTags
 * 7. Return SSRRenderResult
 */
export async function ssrRenderAot(
  module: SSRModule,
  url: string,
  options: SSRRenderAotOptions,
): Promise<SSRRenderResult> {
  const { aotManifest, manifest } = options;
  const ssrTimeout = options.ssrTimeout ?? 300;

  // Normalize URL
  const normalizedUrl = url.endsWith('/index.html')
    ? url.slice(0, -'/index.html'.length) || '/'
    : url;

  const fallbackOptions = {
    ssrTimeout,
    fallbackMetrics: options.fallbackMetrics,
    ssrAuth: options.ssrAuth,
    manifest,
    prefetchSession: options.prefetchSession,
  };

  // 1. Match URL to route patterns in the AOT manifest (exact match — page routes, not layouts)
  const aotPatterns = Object.keys(aotManifest.routes);
  const matches = matchUrlToPatterns(normalizedUrl, aotPatterns, { exact: true });

  if (matches.length === 0) {
    return ssrRenderSinglePass(module, normalizedUrl, fallbackOptions);
  }

  // Use the most specific match (last in sorted array).
  // The length check above guarantees this exists; the guard is for type narrowing.
  const match = matches[matches.length - 1];
  if (!match) {
    return ssrRenderSinglePass(module, normalizedUrl, fallbackOptions);
  }

  const aotEntry = aotManifest.routes[match.pattern];
  if (!aotEntry) {
    return ssrRenderSinglePass(module, normalizedUrl, fallbackOptions);
  }

  // 2. Build query cache from AOT entry's query keys
  const queryCache = new Map<string, unknown>();

  // Resolve parameterized query keys (e.g., 'game-${slug}' → 'game-pokemon-tcg')
  const resolvedQueryKeys = aotEntry.queryKeys
    ? resolveParamQueryKeys(aotEntry.queryKeys, match.params)
    : undefined;

  // Prefetch query data via the SSR prefetch manifest (zero-discovery)
  if (resolvedQueryKeys && resolvedQueryKeys.length > 0 && manifest?.routeEntries) {
    const apiClient = (module as Record<string, unknown>).api as
      | Record<string, Record<string, (...args: unknown[]) => unknown>>
      | undefined;

    if (apiClient) {
      await prefetchForAot(
        resolvedQueryKeys,
        manifest.routeEntries,
        match,
        apiClient,
        ssrTimeout,
        queryCache,
      );
    }
  }

  // Custom data resolver: fill remaining gaps after entity prefetch
  if (resolvedQueryKeys && resolvedQueryKeys.length > 0 && options.aotDataResolver) {
    const unresolvedKeys = resolvedQueryKeys.filter((k) => !queryCache.has(k));
    if (unresolvedKeys.length > 0) {
      try {
        const resolved = await options.aotDataResolver(match.pattern, match.params, unresolvedKeys);
        for (const [key, value] of resolved) {
          queryCache.set(key, value);
        }
      } catch {
        // Resolver failed — fall back to single-pass
        return ssrRenderSinglePass(module, normalizedUrl, fallbackOptions);
      }
    }
  }

  // If the AOT route needs query data but not all keys were resolved,
  // fall back to runtime SSR — the AOT function would crash on undefined data.
  if (resolvedQueryKeys && resolvedQueryKeys.length > 0) {
    const allKeysResolved = resolvedQueryKeys.every((k) => queryCache.has(k));
    if (!allKeysResolved) {
      return ssrRenderSinglePass(module, normalizedUrl, fallbackOptions);
    }
  }

  try {
    // Set global SSR timeout so hole components' query() calls use it
    setGlobalSSRTimeout(ssrTimeout);

    // 3. Create runtime holes
    const holes = createHoles(aotEntry.holes, module, normalizedUrl, queryCache, options.ssrAuth);

    // 4. Build AOT context
    const ctx: SSRAotContext = {
      holes,
      getData: (key) => queryCache.get(key),
      session: options.prefetchSession,
      params: match.params,
    };

    // 5. Call AOT render function
    // Convert query cache to a plain object for the render function
    const data: Record<string, unknown> = {};
    for (const [key, value] of queryCache) {
      data[key] = value;
    }

    let html: string;
    try {
      html = aotEntry.render(data, ctx);
    } catch (renderErr) {
      // AOT render function crashed (e.g., closure variable not defined in .map()
      // callback — #1936). Fall back to single-pass SSR instead of returning 500.
      console.error(
        '[SSR] AOT render failed for',
        match.pattern,
        '— falling back to single-pass:',
        renderErr instanceof Error ? renderErr.message : renderErr,
      );
      return ssrRenderSinglePass(module, normalizedUrl, fallbackOptions);
    }

    // 5b. Wrap page HTML in App layout shell if available (#1977)
    if (aotManifest.app) {
      try {
        // Create holes for the app — DOM shim for all except RouterView
        const appHoleNames = aotManifest.app.holes.filter((h) => h !== 'RouterView');
        const appHoles = createHoles(
          appHoleNames,
          module,
          normalizedUrl,
          queryCache,
          options.ssrAuth,
        );

        // RouterView hole returns the pre-rendered page HTML
        appHoles.RouterView = () => html;

        const appCtx: SSRAotContext = {
          holes: appHoles,
          getData: (key) => queryCache.get(key),
          session: options.prefetchSession,
          params: match.params,
        };

        html = aotManifest.app.render(data, appCtx);
      } catch (appErr) {
        // App shell render failed — return page HTML without layout
        console.error(
          '[SSR] AOT app shell render failed — serving page without layout:',
          appErr instanceof Error ? appErr.message : appErr,
        );
      }
    }

    // 5c. Dev-mode divergence detection: dual render and compare
    if (options.diagnostics && isAotDebugEnabled()) {
      try {
        const domResult = await ssrRenderSinglePass(module, normalizedUrl, fallbackOptions);
        if (domResult.html !== html) {
          options.diagnostics.recordDivergence(match.pattern, html, domResult.html);
        }
      } catch {
        // Divergence check is best-effort — don't break AOT render on DOM shim failure
      }
    }

    // 6. Collect CSS — per-route CSS is pre-filtered at build time (#1988, #1989)
    const routeCss = mergeRouteCss(aotEntry.css, aotManifest.app?.css);
    const css = collectCSSFromModule(module, html, options.fallbackMetrics, routeCss);

    // 7. Build ssrData from query cache
    const ssrData: Array<{ key: string; data: unknown }> = [];
    for (const [key, data] of queryCache) {
      ssrData.push({ key, data });
    }

    return {
      html,
      css: css.cssString,
      ssrData,
      headTags: css.preloadTags,
      matchedRoutePatterns: [match.pattern],
    };
  } finally {
    clearGlobalSSRTimeout();
  }
}

// ─── Data prefetch for AOT ────────────────────────────────────────

/**
 * Prefetch query data for an AOT-rendered route.
 *
 * Uses the SSR prefetch manifest to find query metadata for matched routes,
 * reconstructs fetch descriptors via the API client, and fetches all data
 * in parallel with a timeout. Results are stored in the queryCache keyed
 * by AOT cache key format (`entity-operation`).
 */
async function prefetchForAot(
  queryKeys: string[],
  routeEntries: Record<string, { queries: ExtractedQuery[] }>,
  match: { pattern: string; params: Record<string, string> },
  apiClient: Record<string, Record<string, (...args: unknown[]) => unknown>>,
  ssrTimeout: number,
  queryCache: Map<string, unknown>,
): Promise<void> {
  // Collect queries from the prefetch manifest that match AOT queryKeys
  const entry = routeEntries[match.pattern];
  if (!entry) return;

  const queryKeySet = new Set(queryKeys);
  const fetchJobs: Array<{ aotKey: string; fetchFn: () => Promise<unknown> }> = [];

  for (const query of entry.queries) {
    if (!query.entity || !query.operation) continue;
    const aotKey = `${query.entity}-${query.operation}`;
    if (!queryKeySet.has(aotKey)) continue;

    // Reconstruct a single descriptor from the query metadata
    const descriptors = reconstructDescriptors([query], match.params, apiClient);
    if (descriptors.length > 0 && descriptors[0]) {
      fetchJobs.push({ aotKey, fetchFn: descriptors[0].fetch });
    }
  }

  if (fetchJobs.length === 0) return;

  // Fetch all data in parallel with timeout
  await Promise.allSettled(
    fetchJobs.map(({ aotKey, fetchFn }) => {
      let timer: ReturnType<typeof setTimeout>;
      return Promise.race([
        fetchFn().then((result) => {
          clearTimeout(timer);
          const data = unwrapResult(result);
          queryCache.set(aotKey, data);
        }),
        new Promise<void>((r) => {
          timer = setTimeout(r, ssrTimeout);
        }),
      ]);
    }),
  );
}

/** Unwrap a Result<T> into the data value. */
function unwrapResult(result: unknown): unknown {
  if (result && typeof result === 'object' && 'ok' in result && 'data' in result) {
    const r = result as Record<string, unknown>;
    if (r.ok) return r.data;
  }
  return result;
}

// ─── Parameterized query key resolution ──────────────────────────

/**
 * Resolve `${paramName}` placeholders in query keys with actual route param values.
 *
 * Used by the AOT pipeline to convert template-based query keys
 * (e.g., `game-${slug}`) into concrete cache keys (e.g., `game-pokemon-tcg`)
 * before prefetching and cache lookups.
 */
export function resolveParamQueryKeys(
  queryKeys: string[],
  params: Record<string, string>,
): string[] {
  return queryKeys.map((key) =>
    key.replace(/\$\{(\w+)\}/g, (_, paramName) => params[paramName] ?? ''),
  );
}

// ─── Internal helpers ────────────────────────────────────────────

/** Check if VERTZ_DEBUG includes the 'aot' category. */
export function isAotDebugEnabled(): boolean {
  const env = process.env.VERTZ_DEBUG;
  if (!env) return false;
  return env === '1' || env.split(',').includes('aot');
}

let domShimInstalled = false;

function ensureDomShim(): void {
  if (domShimInstalled && typeof document !== 'undefined') return;
  domShimInstalled = true;
  installDomShim();
}

/** Merge route CSS + app CSS into a single deduplicated array. Cheap O(n) concat. */
function mergeRouteCss(routeCss?: string[], appCss?: string[]): string[] | undefined {
  if (!routeCss && !appCss) return undefined;
  if (!appCss) return routeCss;
  if (!routeCss) return appCss;
  // Deduplicate in case app and route share rules
  const seen = new Set(appCss);
  const merged = [...appCss];
  for (const rule of routeCss) {
    if (!seen.has(rule)) merged.push(rule);
  }
  return merged;
}

/**
 * Collect CSS from module theme + styles + component CSS.
 *
 * When `routeCss` is provided (AOT builds with per-route CSS), it's used
 * directly — no runtime filtering needed. The CSS was pre-filtered at build
 * time by scanning `__ssr_*` function code for class name references (#1988).
 *
 * Falls back to getInjectedCSS() + HTML-based filtering when route CSS
 * is not available (dev mode, non-AOT paths).
 */
function collectCSSFromModule(
  module: SSRModule,
  renderedHtml: string,
  fallbackMetrics?: Record<string, FontFallbackMetrics>,
  routeCss?: string[],
): { cssString: string; preloadTags: string } {
  let themeCss = '';
  let preloadTags = '';

  if (module.theme) {
    try {
      const compiled = compileThemeCached(module.theme, fallbackMetrics);
      themeCss = compiled.css;
      preloadTags = compiled.preloadTags;
    } catch (e) {
      console.error(
        '[vertz] Failed to compile theme export. Ensure your theme is created with defineTheme().',
        e,
      );
    }
  }

  const alreadyIncluded = new Set<string>();
  if (themeCss) alreadyIncluded.add(themeCss);
  if (module.styles) {
    for (const s of module.styles) alreadyIncluded.add(s);
  }

  let componentCss: string[];

  if (routeCss && routeCss.length > 0) {
    // AOT path: per-route CSS was pre-filtered at build time (#1988, #1989).
    // Use directly — zero runtime filtering overhead.
    componentCss = routeCss.filter((s) => !alreadyIncluded.has(s));
  } else {
    // Fallback path: use render-scoped tracker or global getInjectedCSS()
    const ssrCtx = ssrStorage.getStore();
    const tracker = ssrCtx?.cssTracker;
    const useTracker = tracker && tracker.size > 0;
    const rawComponentCss = useTracker ? Array.from(tracker) : (module.getInjectedCSS?.() ?? []);
    componentCss = rawComponentCss.filter((s) => !alreadyIncluded.has(s));

    // When falling back to global CSS (no per-request tracker), filter by HTML
    // usage to eliminate unused eagerly-compiled theme component styles (#1979).
    if (!useTracker && componentCss.length > 0 && renderedHtml) {
      componentCss = filterCSSByHTML(renderedHtml, componentCss);
    }
  }

  const themeTag = themeCss ? `<style data-vertz-css>${themeCss}</style>` : '';
  const globalTag =
    module.styles && module.styles.length > 0
      ? `<style data-vertz-css>${module.styles.join('\n')}</style>`
      : '';
  const componentTag =
    componentCss.length > 0 ? `<style data-vertz-css>${componentCss.join('\n')}</style>` : '';
  const cssString = [themeTag, globalTag, componentTag].filter(Boolean).join('\n');

  return { cssString, preloadTags };
}
