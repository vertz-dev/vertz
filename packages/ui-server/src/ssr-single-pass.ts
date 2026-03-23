/**
 * Single-pass SSR rendering via discovery-only execution.
 *
 * Replaces the two-pass pipeline (discover queries → re-render with data)
 * with: discovery-only (capture queries) → prefetch data → single render.
 *
 * The discovery pass runs the component tree to register queries without
 * rendering to a stream. Resolved data is pre-populated into a fresh
 * context's queryCache, and the app renders once with all available data.
 */

import type { FontFallbackMetrics } from '@vertz/ui';
import { compileTheme } from '@vertz/ui';
import type { SSRAuth } from '@vertz/ui/internals';
import type { ExtractedQuery } from '@vertz/ui-compiler';
import { installDomShim, toVNode } from './dom-shim';
import { renderToStream } from './render-to-stream';
import {
  evaluateAccessRule,
  type PrefetchSession,
  type SerializedAccessRule,
} from './ssr-access-evaluator';
import {
  clearGlobalSSRTimeout,
  getSSRQueries,
  setGlobalSSRTimeout,
  ssrStorage,
} from './ssr-context';
import { reconstructDescriptors } from './ssr-manifest-prefetch';
import {
  createRequestContext,
  type SSRModule,
  type SSRRenderResult,
  ssrRenderToString,
} from './ssr-render';
import { matchUrlToPatterns } from './ssr-route-matcher';
import { streamToString } from './streaming';

/** Serialized entity access rules from the prefetch manifest. */
export type EntityAccessMap = Record<string, Partial<Record<string, SerializedAccessRule>>>;

export interface SSRPrefetchManifest {
  /** Route patterns present in the manifest. */
  routePatterns: string[];
  /** Entity access rules keyed by entity name → operation → serialized rule. */
  entityAccess?: EntityAccessMap;
  /** Route entries with query binding metadata for zero-discovery prefetch. */
  routeEntries?: Record<string, { queries: ExtractedQuery[] }>;
}

export interface SSRSinglePassOptions {
  ssrTimeout?: number;
  /** Pre-computed font fallback metrics (computed at server startup). */
  fallbackMetrics?: Record<string, FontFallbackMetrics>;
  /** Auth state resolved from session cookie. */
  ssrAuth?: SSRAuth;
  /** Set to false to fall back to two-pass rendering. Default: true. */
  prefetch?: boolean;
  /** Prefetch manifest for entity access filtering. */
  manifest?: SSRPrefetchManifest;
  /** Session data for access rule evaluation. */
  prefetchSession?: PrefetchSession;
}

/**
 * Render an SSR module in a single pass via discovery-only execution.
 *
 * 1. Discovery: Run the app factory to capture query registrations (no stream render)
 * 2. Prefetch: Await all discovered queries with timeout
 * 3. Render: Create a fresh context with pre-populated cache, render once
 *
 * Falls back to two-pass (`ssrRenderToString`) when:
 * - `prefetch: false` is set
 * - A redirect is detected during discovery
 */
export async function ssrRenderSinglePass(
  module: SSRModule,
  url: string,
  options?: SSRSinglePassOptions,
): Promise<SSRRenderResult> {
  // Toggle: fall back to two-pass when prefetch is disabled
  if (options?.prefetch === false) {
    return ssrRenderToString(module, url, options);
  }

  const normalizedUrl = url.endsWith('/index.html')
    ? url.slice(0, -'/index.html'.length) || '/'
    : url;

  const ssrTimeout = options?.ssrTimeout ?? 300;

  ensureDomShim();

  // ── Zero-Discovery Fast Path ──────────────────────────────────
  // If the manifest has routeEntries and the module exports an API client,
  // reconstruct descriptors from manifest metadata + route params and skip
  // the discovery pass entirely (single DOM traversal).
  const zeroDiscoveryData = attemptZeroDiscovery(normalizedUrl, module, options, ssrTimeout);

  if (zeroDiscoveryData) {
    return renderWithPrefetchedData(module, normalizedUrl, zeroDiscoveryData, options);
  }

  // ── Phase 1: Discovery ──────────────────────────────────────────
  // Run the app factory in an SSR context to capture query registrations.
  // This builds the DOM tree (via DOM shim) but does NOT render to stream.

  const discoveryCtx = createRequestContext(normalizedUrl);
  if (options?.ssrAuth) {
    discoveryCtx.ssrAuth = options.ssrAuth;
  }

  const discoveredData = await ssrStorage.run(discoveryCtx, async () => {
    try {
      setGlobalSSRTimeout(ssrTimeout);

      const createApp = resolveAppFactory(module);
      createApp();

      // If a redirect was detected during discovery, bail out early
      if (discoveryCtx.ssrRedirect) {
        return { redirect: discoveryCtx.ssrRedirect } as const;
      }

      // Resolve lazy route components discovered during the discovery pass
      if (discoveryCtx.pendingRouteComponents?.size) {
        const entries = Array.from(discoveryCtx.pendingRouteComponents.entries());
        const results = await Promise.allSettled(
          entries.map(([route, promise]) =>
            Promise.race([
              promise.then((mod) => ({ route, factory: mod.default })),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('lazy route timeout')), ssrTimeout),
              ),
            ]),
          ),
        );
        discoveryCtx.resolvedComponents = new Map();
        for (const result of results) {
          if (result.status === 'fulfilled') {
            const { route, factory } = result.value as {
              route: object;
              factory: () => Node;
            };
            discoveryCtx.resolvedComponents.set(route, factory);
          }
        }
        discoveryCtx.pendingRouteComponents = undefined;
      }

      // Await registered SSR queries with per-query timeouts.
      // If entity access rules are provided, filter out ineligible queries.
      const queries = getSSRQueries();
      const eligibleQueries = filterByEntityAccess(
        queries,
        options?.manifest?.entityAccess,
        options?.prefetchSession,
      );
      const resolvedQueries: Array<{ key: string; data: unknown }> = [];

      if (eligibleQueries.length > 0) {
        await Promise.allSettled(
          eligibleQueries.map(({ promise, timeout, resolve, key }) =>
            Promise.race([
              promise.then((data) => {
                resolve(data);
                resolvedQueries.push({ key, data });
                return 'resolved';
              }),
              new Promise((r) => setTimeout(r, timeout || ssrTimeout)).then(() => 'timeout'),
            ]),
          ),
        );
      }

      return {
        resolvedQueries,
        resolvedComponents: discoveryCtx.resolvedComponents,
      } as const;
    } finally {
      clearGlobalSSRTimeout();
    }
  });

  // Handle redirect detected during discovery
  if ('redirect' in discoveredData) {
    return {
      html: '',
      css: '',
      ssrData: [],
      headTags: '',
      redirect: discoveredData.redirect,
    };
  }

  // ── Phase 2: Render ─────────────────────────────────────────────
  // Create a fresh SSR context with pre-populated cache and render once.

  const renderCtx = createRequestContext(normalizedUrl);
  if (options?.ssrAuth) {
    renderCtx.ssrAuth = options.ssrAuth;
  }

  // Pre-populate the query cache with discovered data
  for (const { key, data } of discoveredData.resolvedQueries) {
    renderCtx.queryCache.set(key, data);
  }

  // Transfer resolved lazy route components.
  // NOTE: Unlike the two-pass pipeline where the same context is reused,
  // here we use separate contexts for discovery and render. The discovery
  // context only sets resolvedComponents when lazy routes exist. The render
  // context always gets an initialized Map (via ?? new Map()) to ensure
  // consistent behavior regardless of lazy route presence.
  renderCtx.resolvedComponents = discoveredData.resolvedComponents ?? new Map();

  return ssrStorage.run(renderCtx, async () => {
    try {
      setGlobalSSRTimeout(ssrTimeout);

      const createApp = resolveAppFactory(module);

      // Compile theme CSS if the module exports a theme
      let themeCss = '';
      let themePreloadTags = '';
      if (module.theme) {
        try {
          const compiled = compileTheme(module.theme, {
            fallbackMetrics: options?.fallbackMetrics,
          });
          themeCss = compiled.css;
          themePreloadTags = compiled.preloadTags;
        } catch (e) {
          console.error(
            '[vertz] Failed to compile theme export. Ensure your theme is created with defineTheme().',
            e,
          );
        }
      }

      // Single render pass — queries hit pre-populated cache
      const app = createApp();
      const vnode = toVNode(app);
      const stream = renderToStream(vnode);
      const html = await streamToString(stream);
      const css = collectCSS(themeCss, module);

      // Collect SSR data for client-side hydration.
      // Include both pre-populated data (from discovery) and any new queries
      // that registered during the render pass (cache misses — e.g., timed-out
      // queries that weren't in the pre-populated cache).
      const ssrData = discoveredData.resolvedQueries.map(({ key, data }) => ({
        key,
        data: JSON.parse(JSON.stringify(data)),
      }));

      return {
        html,
        css,
        ssrData,
        headTags: themePreloadTags,
        discoveredRoutes: renderCtx.discoveredRoutes,
        matchedRoutePatterns: renderCtx.matchedRoutePatterns,
      };
    } finally {
      clearGlobalSSRTimeout();
    }
  });
}

// ── Zero-Discovery helpers ──────────────────────────────────────

interface ZeroDiscoveryResult {
  resolvedQueries: Array<{ key: string; data: unknown }>;
}

/**
 * Attempt zero-discovery prefetching: reconstruct descriptors from the manifest
 * and fetch data without executing the component tree.
 *
 * Returns null if zero-discovery is not possible (no manifest, no API client,
 * no route match, etc.) — caller should fall back to discovery-based approach.
 */
function attemptZeroDiscovery(
  url: string,
  module: SSRModule,
  options: SSRSinglePassOptions | undefined,
  ssrTimeout: number,
): Promise<ZeroDiscoveryResult> | null {
  const manifest = options?.manifest;
  if (!manifest?.routeEntries || !module.api) return null;

  // Match URL to route patterns to get route params
  const matches = matchUrlToPatterns(url, manifest.routePatterns);
  if (matches.length === 0) return null;

  // Collect all queries from all matched routes (layouts + page).
  // Merge route params from the most specific match (last in array).
  const allQueries: ExtractedQuery[] = [];
  let mergedParams: Record<string, string> = {};

  for (const match of matches) {
    const entry = manifest.routeEntries[match.pattern];
    if (entry) {
      allQueries.push(...entry.queries);
    }
    mergedParams = { ...mergedParams, ...match.params };
  }

  if (allQueries.length === 0) return null;

  // Reconstruct descriptors from manifest + route params + API client
  const descriptors = reconstructDescriptors(allQueries, mergedParams, module.api);

  if (descriptors.length === 0) return null;

  // Fire all fetches in parallel with timeout
  return prefetchFromDescriptors(descriptors, ssrTimeout);
}

/**
 * Fire all descriptor fetches in parallel, applying SSR timeout.
 */
async function prefetchFromDescriptors(
  descriptors: Array<{ key: string; fetch: () => Promise<unknown> }>,
  ssrTimeout: number,
): Promise<ZeroDiscoveryResult> {
  const resolvedQueries: Array<{ key: string; data: unknown }> = [];

  await Promise.allSettled(
    descriptors.map(({ key, fetch: fetchFn }) =>
      Promise.race([
        fetchFn().then((result) => {
          // _fetch() returns Result<T> = { ok: true, data: T } | { ok: false, ... }
          // The query cache stores the unwrapped data (T), matching what query()
          // stores during its internal processing in the discovery path.
          const data = unwrapResult(result);
          resolvedQueries.push({ key, data });
          return 'resolved';
        }),
        new Promise((r) => setTimeout(r, ssrTimeout)).then(() => 'timeout'),
      ]),
    ),
  );

  return { resolvedQueries };
}

/**
 * Unwrap a Result<T> into the data value. If the result is ok, returns
 * the data. Otherwise returns the raw result (error case).
 */
function unwrapResult(result: unknown): unknown {
  if (result && typeof result === 'object' && 'ok' in result && 'data' in result) {
    const r = result as Record<string, unknown>;
    if (r.ok) return r.data;
  }
  return result;
}

/**
 * Render the app with pre-fetched data (shared by both zero-discovery and discovery paths).
 */
async function renderWithPrefetchedData(
  module: SSRModule,
  normalizedUrl: string,
  prefetchedData: ZeroDiscoveryResult | Promise<ZeroDiscoveryResult>,
  options: SSRSinglePassOptions | undefined,
): Promise<SSRRenderResult> {
  const data = await prefetchedData;
  const ssrTimeout = options?.ssrTimeout ?? 300;

  const renderCtx = createRequestContext(normalizedUrl);
  if (options?.ssrAuth) {
    renderCtx.ssrAuth = options.ssrAuth;
  }

  // Pre-populate the query cache with prefetched data
  for (const { key, data: queryData } of data.resolvedQueries) {
    renderCtx.queryCache.set(key, queryData);
  }

  // No resolved components from discovery — initialize empty Map to signal "pass 2 mode"
  renderCtx.resolvedComponents = new Map();

  return ssrStorage.run(renderCtx, async () => {
    try {
      setGlobalSSRTimeout(ssrTimeout);

      const createApp = resolveAppFactory(module);

      // Compile theme CSS if the module exports a theme
      let themeCss = '';
      let themePreloadTags = '';
      if (module.theme) {
        try {
          const compiled = compileTheme(module.theme, {
            fallbackMetrics: options?.fallbackMetrics,
          });
          themeCss = compiled.css;
          themePreloadTags = compiled.preloadTags;
        } catch (e) {
          console.error(
            '[vertz] Failed to compile theme export. Ensure your theme is created with defineTheme().',
            e,
          );
        }
      }

      // Single render pass — queries hit pre-populated cache
      const app = createApp();
      const vnode = toVNode(app);
      const stream = renderToStream(vnode);
      const html = await streamToString(stream);

      // Check for redirect (e.g., ProtectedRoute sets ssrRedirect during render)
      if (renderCtx.ssrRedirect) {
        return {
          html: '',
          css: '',
          ssrData: [],
          headTags: '',
          redirect: renderCtx.ssrRedirect,
          discoveredRoutes: renderCtx.discoveredRoutes,
          matchedRoutePatterns: renderCtx.matchedRoutePatterns,
        };
      }

      const css = collectCSS(themeCss, module);

      const ssrData = data.resolvedQueries.map(({ key, data: d }) => ({
        key,
        data: JSON.parse(JSON.stringify(d)),
      }));

      return {
        html,
        css,
        ssrData,
        headTags: themePreloadTags,
        discoveredRoutes: renderCtx.discoveredRoutes,
        matchedRoutePatterns: renderCtx.matchedRoutePatterns,
      };
    } finally {
      clearGlobalSSRTimeout();
    }
  });
}

// ── Internal helpers ────────────────────────────────────────────

let domShimInstalled = false;

function ensureDomShim(): void {
  if (domShimInstalled && typeof document !== 'undefined') return;
  domShimInstalled = true;
  installDomShim();
}

function resolveAppFactory(module: SSRModule): () => unknown {
  const createApp = module.default || module.App;
  if (typeof createApp !== 'function') {
    throw new Error('App entry must export a default function or named App function');
  }
  return createApp;
}

/**
 * Filter queries by entity access rules from the manifest.
 *
 * Cache key format: `GET:/entity?params` — entity name is the first path segment.
 * Method mapping: GET:/entity → list, GET:/entity/{id} → get
 *
 * If no entityAccess map or session is provided, all queries pass through (no filtering).
 */
function filterByEntityAccess(
  queries: ReturnType<typeof getSSRQueries>,
  entityAccess: EntityAccessMap | undefined,
  session: PrefetchSession | undefined,
): ReturnType<typeof getSSRQueries> {
  if (!entityAccess || !session) return queries;

  return queries.filter(({ key }) => {
    const entity = extractEntityFromKey(key);
    const method = extractMethodFromKey(key);
    if (!entity) return true; // Can't determine entity → don't filter

    const entityRules = entityAccess[entity];
    if (!entityRules) return true; // No access rules → always eligible

    const rule = entityRules[method];
    if (!rule) return true; // No rule for this operation → eligible

    return evaluateAccessRule(rule, session);
  });
}

/**
 * Extract entity name from a cache key.
 * Key format: `GET:/entity?params` or `GET:/entity/{id}?params`
 * Returns the first path segment (entity name).
 */
function extractEntityFromKey(key: string): string | undefined {
  // Format: METHOD:/path?query
  const pathStart = key.indexOf(':/');
  if (pathStart === -1) return undefined;
  const path = key.slice(pathStart + 2); // Remove METHOD:/
  const firstSlash = path.indexOf('/');
  const questionMark = path.indexOf('?');

  if (firstSlash === -1 && questionMark === -1) return path;
  if (firstSlash === -1) return path.slice(0, questionMark);
  if (questionMark === -1) return path.slice(0, firstSlash);
  return path.slice(0, Math.min(firstSlash, questionMark));
}

/**
 * Determine operation method from cache key.
 * `GET:/entity` or `GET:/entity?params` → 'list'
 * `GET:/entity/{id}` → 'get'
 */
function extractMethodFromKey(key: string): string {
  const pathStart = key.indexOf(':/');
  if (pathStart === -1) return 'list';
  const path = key.slice(pathStart + 2);
  const cleanPath = path.split('?')[0] ?? ''; // Remove query params
  const segments = cleanPath.split('/').filter(Boolean);
  // If there's more than one segment, it's a get (entity/id)
  return segments.length > 1 ? 'get' : 'list';
}

function collectCSS(themeCss: string, module: SSRModule): string {
  const alreadyIncluded = new Set<string>();
  if (themeCss) alreadyIncluded.add(themeCss);
  if (module.styles) {
    for (const s of module.styles) alreadyIncluded.add(s);
  }

  const componentCss = module.getInjectedCSS
    ? module.getInjectedCSS().filter((s) => !alreadyIncluded.has(s))
    : [];

  const themeTag = themeCss ? `<style data-vertz-css>${themeCss}</style>` : '';
  const globalTag =
    module.styles && module.styles.length > 0
      ? `<style data-vertz-css>${module.styles.join('\n')}</style>`
      : '';
  const componentTag =
    componentCss.length > 0 ? `<style data-vertz-css>${componentCss.join('\n')}</style>` : '';
  return [themeTag, globalTag, componentTag].filter(Boolean).join('\n');
}
