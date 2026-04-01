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
import type { SSRAuth } from '@vertz/ui/internals';
import type { ExtractedQuery } from './compiler/prefetch-manifest';
import { filterCSSByHTML } from './css-filter';
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
  compileThemeCached,
  createRequestContext,
  type SSRModule,
  type SSRRenderResult,
} from './ssr-shared';
import { matchUrlToPatterns } from './ssr-route-matcher';
import { safeSerialize } from './ssr-streaming-runtime';
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
  /** Prefetch manifest for entity access filtering. */
  manifest?: SSRPrefetchManifest;
  /** Session data for access rule evaluation. */
  prefetchSession?: PrefetchSession;
  /**
   * Raw Cookie header from the request.
   * When set, `document.cookie` returns this value during SSR rendering,
   * so app code that reads cookies works the same as in a browser.
   */
  cookies?: string;
}

/**
 * Render an SSR module in a single pass via discovery-only execution.
 *
 * 1. Discovery: Run the app factory to capture query registrations (no stream render)
 * 2. Prefetch: Await all discovered queries with timeout
 * 3. Render: Create a fresh context with pre-populated cache, render once
 */
export async function ssrRenderSinglePass(
  module: SSRModule,
  url: string,
  options?: SSRSinglePassOptions,
): Promise<SSRRenderResult> {
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
  const discoveredData = await runDiscoveryPhase(normalizedUrl, ssrTimeout, module, options);

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
  if (options?.cookies) {
    renderCtx.cookies = options.cookies;
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

      // Compile theme CSS if the module exports a theme (cached across requests)
      let themeCss = '';
      let themePreloadTags = '';
      if (module.theme) {
        try {
          const compiled = compileThemeCached(module.theme, options?.fallbackMetrics);
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
      const css = collectCSS(themeCss, module, html);

      // Collect SSR data for client-side hydration.
      // Data is JSON-safe (from fetch responses) — safeSerialize in
      // template-inject handles the final serialization.
      const ssrData = discoveredData.resolvedQueries.map(({ key, data }) => ({
        key,
        data,
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

/**
 * Result type for progressive SSR rendering.
 * Returns a render stream instead of a buffered HTML string.
 */
export interface SSRProgressiveResult {
  /** CSS `<style>` tags for injection into `<head>`. */
  css: string;
  /** SSR data entries for client hydration (injected in tail). */
  ssrData: Array<{ key: string; data: unknown }>;
  /** Font preload `<link>` tags for `<head>`. */
  headTags: string;
  /** Route patterns that matched the current URL (for per-route modulepreload). */
  matchedRoutePatterns?: string[];
  /** Set when ProtectedRoute writes a redirect during SSR. Server should return 302. */
  redirect?: { to: string };
  /** Render stream producing app HTML chunks. Undefined when redirect is set. */
  renderStream?: ReadableStream<Uint8Array>;
}

/**
 * Progressive SSR rendering: discovery → prefetch → streaming render.
 *
 * Like ssrRenderSinglePass but returns the render stream instead of
 * stringifying it. This enables the handler to send `<head>` content
 * immediately while the render stream is still producing body HTML.
 *
 * Falls back to undefined renderStream (redirect result) when a redirect
 * is detected during discovery.
 *
 * Does NOT support zero-discovery (manifest routeEntries). The caller
 * should fall back to the buffered path for zero-discovery routes.
 */
export async function ssrRenderProgressive(
  module: SSRModule,
  url: string,
  options?: SSRSinglePassOptions,
): Promise<SSRProgressiveResult> {
  const normalizedUrl = url.endsWith('/index.html')
    ? url.slice(0, -'/index.html'.length) || '/'
    : url;

  const ssrTimeout = options?.ssrTimeout ?? 300;

  ensureDomShim();

  // ── Phase 1: Discovery (shared with ssrRenderSinglePass) ──────
  const discoveryResult = await runDiscoveryPhase(normalizedUrl, ssrTimeout, module, options);

  if ('redirect' in discoveryResult) {
    return {
      css: '',
      ssrData: [],
      headTags: '',
      redirect: discoveryResult.redirect,
    };
  }

  // ── Phase 2: Render (streaming — no stringification) ──────────
  const renderCtx = createRequestContext(normalizedUrl);
  if (options?.ssrAuth) {
    renderCtx.ssrAuth = options.ssrAuth;
  }
  if (options?.cookies) {
    renderCtx.cookies = options.cookies;
  }

  for (const { key, data } of discoveryResult.resolvedQueries) {
    renderCtx.queryCache.set(key, data);
  }
  renderCtx.resolvedComponents = discoveryResult.resolvedComponents ?? new Map();

  // Enter SSR storage for the render pass
  return ssrStorage.run(renderCtx, () => {
    try {
      setGlobalSSRTimeout(ssrTimeout);

      const createApp = resolveAppFactory(module);

      let themeCss = '';
      let themePreloadTags = '';
      if (module.theme) {
        try {
          const compiled = compileThemeCached(module.theme, options?.fallbackMetrics);
          themeCss = compiled.css;
          themePreloadTags = compiled.preloadTags;
        } catch (e) {
          console.error(
            '[vertz] Failed to compile theme export. Ensure your theme is created with defineTheme().',
            e,
          );
        }
      }

      // Create app and get render stream — do NOT await/stringify
      const app = createApp();
      const vnode = toVNode(app);
      const renderStream = renderToStream(vnode);

      // Collect CSS now (available after createApp — css() runs at module/import level).
      // Streaming path: HTML not available yet, but cssTracker is active so filter won't run.
      const css = collectCSS(themeCss, module, '');

      const ssrData = discoveryResult.resolvedQueries.map(({ key, data }) => ({
        key,
        data,
      }));

      return {
        css,
        ssrData,
        headTags: themePreloadTags,
        matchedRoutePatterns: renderCtx.matchedRoutePatterns,
        renderStream,
      };
    } finally {
      clearGlobalSSRTimeout();
    }
  });
}

// ── Shared Discovery Phase ──────────────────────────────────────

/** Raw query handle from discovery — not yet resolved. */
interface RawQueryHandle {
  promise: Promise<unknown>;
  timeout: number;
  resolve: (data: unknown) => void;
  key: string;
}

/** Result of running the app factory to discover queries. */
type QueryDiscoveryResult =
  | { redirect: { to: string }; queries: []; resolvedComponents?: undefined }
  | {
      queries: RawQueryHandle[];
      resolvedComponents?: Map<object, () => Node>;
    };

type DiscoveryResult =
  | { redirect: { to: string } }
  | {
      resolvedQueries: Array<{ key: string; data: unknown }>;
      resolvedComponents?: Map<object, () => Node>;
    };

/**
 * Run the app factory to discover queries and resolve lazy routes.
 * Returns raw query handles (not yet awaited).
 *
 * This is the lowest-level discovery function, shared by:
 * - `runDiscoveryPhase()` (batch-resolves queries)
 * - `ssrStreamNavQueries()` (streams per-query SSE events)
 */
async function runQueryDiscovery(
  normalizedUrl: string,
  ssrTimeout: number,
  module: SSRModule,
  options?: { ssrAuth?: SSRAuth; cookies?: string },
): Promise<QueryDiscoveryResult> {
  ensureDomShim();
  const ctx = createRequestContext(normalizedUrl);
  if (options?.ssrAuth) {
    ctx.ssrAuth = options.ssrAuth;
  }
  if (options?.cookies) {
    ctx.cookies = options.cookies;
  }

  return ssrStorage.run(ctx, async () => {
    try {
      setGlobalSSRTimeout(ssrTimeout);

      const createApp = resolveAppFactory(module);
      createApp();

      if (ctx.ssrRedirect) {
        return { redirect: ctx.ssrRedirect, queries: [] };
      }

      // Resolve lazy route components
      if (ctx.pendingRouteComponents?.size) {
        const entries = Array.from(ctx.pendingRouteComponents.entries());
        const results = await Promise.allSettled(
          entries.map(([route, promise]: [object, Promise<{ default: () => Node }>]) =>
            Promise.race([
              promise.then((mod) => ({ route, factory: mod.default })),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('lazy route timeout')), ssrTimeout),
              ),
            ]),
          ),
        );
        ctx.resolvedComponents = new Map();
        for (const result of results) {
          if (result.status === 'fulfilled') {
            const { route, factory } = result.value as {
              route: object;
              factory: () => Node;
            };
            ctx.resolvedComponents.set(route, factory);
          }
        }
        ctx.pendingRouteComponents = undefined;
      }

      const queries = getSSRQueries();
      return {
        queries: queries.map((q: { promise: Promise<unknown>; timeout?: number; resolve: (data: unknown) => void; key: string }) => ({
          promise: q.promise,
          timeout: q.timeout || ssrTimeout,
          resolve: q.resolve,
          key: q.key,
        })),
        resolvedComponents: ctx.resolvedComponents,
      };
    } finally {
      clearGlobalSSRTimeout();
    }
  });
}

/**
 * Run the SSR discovery phase: execute app factory to capture query
 * registrations, resolve lazy routes, and prefetch query data.
 *
 * Shared by ssrRenderSinglePass and ssrRenderProgressive.
 */
async function runDiscoveryPhase(
  normalizedUrl: string,
  ssrTimeout: number,
  module: SSRModule,
  options?: SSRSinglePassOptions,
): Promise<DiscoveryResult> {
  const discovery = await runQueryDiscovery(normalizedUrl, ssrTimeout, module, options);

  if ('redirect' in discovery) {
    return { redirect: discovery.redirect };
  }

  // Filter by entity access rules
  const eligibleQueries = filterByEntityAccess(
    discovery.queries,
    options?.manifest?.entityAccess,
    options?.prefetchSession,
  );

  // Batch-resolve queries with timeouts
  const resolvedQueries: Array<{ key: string; data: unknown }> = [];
  if (eligibleQueries.length > 0) {
    await Promise.allSettled(
      eligibleQueries.map(({ promise, timeout, resolve, key }: RawQueryHandle) =>
        Promise.race([
          promise.then((data: unknown) => {
            resolve(data);
            resolvedQueries.push({ key, data });
            return 'resolved';
          }),
          new Promise((r) => setTimeout(r, timeout)).then(() => 'timeout'),
        ]),
      ),
    );
  }

  return {
    resolvedQueries,
    resolvedComponents: discovery.resolvedComponents,
  };
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
  if (options?.cookies) {
    renderCtx.cookies = options.cookies;
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

      // Compile theme CSS if the module exports a theme (cached across requests)
      let themeCss = '';
      let themePreloadTags = '';
      if (module.theme) {
        try {
          const compiled = compileThemeCached(module.theme, options?.fallbackMetrics);
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

      const css = collectCSS(themeCss, module, html);

      const ssrData = data.resolvedQueries.map(({ key, data: d }) => ({
        key,
        data: d,
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

// ── Nav Query Streaming ─────────────────────────────────────────

/**
 * Stream nav query results as individual SSE events.
 *
 * Returns a `ReadableStream` that emits each query result as it settles:
 * - `event: data` for resolved queries (with key + data)
 * - `event: done` when all queries have settled
 *
 * Timed-out or rejected queries are silently dropped (no event sent).
 * The client's `doneHandler` detects missing data and falls back to
 * client-side fetch.
 *
 * The render lock is released after query discovery, before
 * streaming begins. This allows concurrent SSR renders while queries
 * are still resolving.
 */
export async function ssrStreamNavQueries(
  module: SSRModule,
  url: string,
  options?: { ssrTimeout?: number; navSsrTimeout?: number },
): Promise<ReadableStream<Uint8Array>> {
  const normalizedUrl = url.endsWith('/index.html')
    ? url.slice(0, -'/index.html'.length) || '/'
    : url;

  const ssrTimeout = options?.ssrTimeout ?? 300;
  const navTimeout = options?.navSsrTimeout ?? 5000;

  const discovery = await runQueryDiscovery(normalizedUrl, ssrTimeout, module);

  // Redirect or no queries → done event only
  if ('redirect' in discovery || discovery.queries.length === 0) {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
        controller.close();
      },
    });
  }

  const queries = discovery.queries;

  // Stream individual SSE events as each query settles.
  //
  // The controller can be closed externally when the client aborts the request
  // (e.g., navigating again before the stream completes). Our scheduled
  // callbacks (.then, setTimeout) may still fire after the abort, so all
  // controller operations are wrapped in try/catch to prevent crashes.
  const encoder = new TextEncoder();
  let remaining = queries.length;

  return new ReadableStream({
    start(controller) {
      let closed = false;

      function safeEnqueue(chunk: Uint8Array): void {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      }

      function safeClose(): void {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed by abort */
        }
      }

      function checkDone(): void {
        if (remaining === 0) {
          safeEnqueue(encoder.encode('event: done\ndata: {}\n\n'));
          safeClose();
        }
      }

      for (const { promise, resolve, key } of queries) {
        let settled = false;

        // Race: query promise vs navTimeout
        promise.then(
          (data: unknown) => {
            if (settled) return;
            settled = true;
            resolve(data);
            const entry = { key, data };
            safeEnqueue(encoder.encode(`event: data\ndata: ${safeSerialize(entry)}\n\n`));
            remaining--;
            checkDone();
          },
          () => {
            // Query rejected — silently drop (client doneHandler will fallback)
            if (settled) return;
            settled = true;
            remaining--;
            checkDone();
          },
        );

        setTimeout(() => {
          if (settled) return;
          settled = true;
          // Hard timeout — silently close without event
          remaining--;
          checkDone();
        }, navTimeout);
      }
    },
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
function filterByEntityAccess<T extends { key: string }>(
  queries: T[],
  entityAccess: EntityAccessMap | undefined,
  session: PrefetchSession | undefined,
): T[] {
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

function collectCSS(themeCss: string, module: SSRModule, renderedHtml: string): string {
  const alreadyIncluded = new Set<string>();
  if (themeCss) alreadyIncluded.add(themeCss);
  if (module.styles) {
    for (const s of module.styles) alreadyIncluded.add(s);
  }

  // Prefer render-scoped CSS tracker when it captured CSS during this render;
  // fall back to global getInjectedCSS() when the tracker is empty (e.g.,
  // styles were eagerly created at import time via buildComponents()).
  const ssrCtx = ssrStorage.getStore();
  const tracker = ssrCtx?.cssTracker;
  const useTracker = tracker && tracker.size > 0;
  const rawComponentCss = useTracker ? Array.from(tracker) : (module.getInjectedCSS?.() ?? []);
  let componentCss = rawComponentCss.filter((s) => !alreadyIncluded.has(s));

  // When falling back to global CSS (no per-request tracker), filter by HTML
  // usage to eliminate unused eagerly-compiled theme component styles (#1979).
  if (!useTracker && componentCss.length > 0 && renderedHtml) {
    componentCss = filterCSSByHTML(renderedHtml, componentCss);
  }

  const themeTag = themeCss ? `<style data-vertz-css>${themeCss}</style>` : '';
  const globalTag =
    module.styles && module.styles.length > 0
      ? `<style data-vertz-css>${module.styles.join('\n')}</style>`
      : '';
  const componentTag =
    componentCss.length > 0 ? `<style data-vertz-css>${componentCss.join('\n')}</style>` : '';
  return [themeTag, globalTag, componentTag].filter(Boolean).join('\n');
}
