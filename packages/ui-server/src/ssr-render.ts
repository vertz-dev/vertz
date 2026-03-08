/**
 * Reusable SSR rendering functions for both dev (virtual entry) and production.
 *
 * Extracts the two-pass render logic from the Vite virtual SSR entry into
 * real TypeScript functions that can be imported directly.
 */

import { compileTheme, type Theme } from '@vertz/ui';
import type { SSRRenderContext } from '@vertz/ui/internals';
import { EntityStore, MemoryCache, QueryEnvelopeStore } from '@vertz/ui/internals';
import { installDomShim, toVNode } from './dom-shim';
import { renderToStream } from './render-to-stream';
import { createSSRAdapter } from './ssr-adapter';
import {
  clearGlobalSSRTimeout,
  getSSRQueries,
  setGlobalSSRTimeout,
  ssrStorage,
} from './ssr-context';
import { safeSerialize } from './ssr-streaming-runtime';
import { streamToString } from './streaming';

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
    queryCache: new MemoryCache<unknown>(),
    inflight: new Map(),
    queries: [],
    errors: [],
  };
}

/**
 * Install the DOM shim once (idempotent).
 *
 * The DOM shim provides `document`, `window`, and other browser globals
 * needed by framework code that directly accesses globals (e.g.,
 * jsx-runtime's document.createElement, presence.ts, list-transition.ts).
 * It is installed once per process — not per-render — because all SSR
 * state is isolated via AsyncLocalStorage (SSRRenderContext).
 */
let domShimInstalled = false;

function ensureDomShim(): void {
  // Check both our flag AND whether document actually exists.
  // removeDomShim() can delete document without resetting our flag
  // (e.g., in test teardown), leaving us with a stale flag.
  if (domShimInstalled && typeof document !== 'undefined') return;
  domShimInstalled = true;
  installDomShim();
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
}

export interface SSRRenderResult {
  html: string;
  css: string;
  ssrData: Array<{ key: string; data: unknown }>;
}

export interface SSRDiscoverResult {
  resolved: Array<{ key: string; data: unknown }>;
  pending: string[];
}

/**
 * Resolve the app factory from a module.
 * Supports `default` and named `App` exports.
 */
function resolveAppFactory(module: SSRModule): () => unknown {
  const createApp = module.default || module.App;
  if (typeof createApp !== 'function') {
    throw new Error('App entry must export a default function or named App function');
  }
  return createApp;
}

/**
 * Collect CSS from the module's bundled @vertz/ui instance + theme + global styles.
 * Returns a single string with <style> tags.
 *
 * The Vite SSR build inlines @vertz/ui into the server bundle, creating
 * a separate module instance from the one @vertz/ui-server depends on.
 * This means our own getInjectedCSS() reads a DIFFERENT Set than what
 * the bundled injectCSS() writes to.
 *
 * To bridge the gap, the SSR module must export `getInjectedCSS` from
 * @vertz/ui, giving us access to the bundled instance's tracked CSS.
 */
function collectCSS(themeCss: string, module: SSRModule): string {
  const themeTag = themeCss ? `<style data-vertz-css>${themeCss}</style>` : '';
  const globalTags = module.styles
    ? module.styles.map((s) => `<style data-vertz-css>${s}</style>`).join('\n')
    : '';

  // Build a set of CSS strings already included via theme and module.styles
  // to avoid duplicating them in the component CSS section.
  const alreadyIncluded = new Set<string>();
  if (themeCss) alreadyIncluded.add(themeCss);
  if (module.styles) {
    for (const s of module.styles) alreadyIncluded.add(s);
  }

  const componentCss = module.getInjectedCSS
    ? module.getInjectedCSS().filter((s) => !alreadyIncluded.has(s))
    : [];

  const componentStyles = componentCss.map((s) => `<style data-vertz-css>${s}</style>`).join('\n');
  return [themeTag, globalTags, componentStyles].filter(Boolean).join('\n');
}

/**
 * Render an SSR module to an HTML string with CSS and pre-fetched query data.
 *
 * Performs a two-pass render:
 * - Pass 1: Discovery — calls the app to trigger query() registrations, awaits them
 * - Pass 2: Render — calls the app again with data populated, renders to HTML
 */
export async function ssrRenderToString(
  module: SSRModule,
  url: string,
  options?: { ssrTimeout?: number },
): Promise<SSRRenderResult> {
  const normalizedUrl = url.endsWith('/index.html')
    ? url.slice(0, -'/index.html'.length) || '/'
    : url;

  const ssrTimeout = options?.ssrTimeout ?? 300;

  ensureDomShim();
  const ctx = createRequestContext(normalizedUrl);

  return ssrStorage.run(ctx, async () => {
    try {
      setGlobalSSRTimeout(ssrTimeout);

      const createApp = resolveAppFactory(module);

      // Compile theme CSS if the module exports a theme
      let themeCss = '';
      if (module.theme) {
        try {
          themeCss = compileTheme(module.theme).css;
        } catch (e) {
          console.error(
            '[vertz] Failed to compile theme export. Ensure your theme is created with defineTheme().',
            e,
          );
        }
      }

      // Pass 1: Discovery — triggers query() registrations
      createApp();

      // Await registered SSR queries with per-query timeouts
      const queries = getSSRQueries();
      const resolvedQueries: Array<{ key: string; data: unknown }> = [];
      if (queries.length > 0) {
        await Promise.allSettled(
          queries.map(({ promise, timeout, resolve, key }) =>
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
        // Clear queries before Pass 2 to avoid double-registration
        const store = ssrStorage.getStore();
        if (store) store.queries = [];
      }

      // Pass 2: Render with pre-fetched data
      const app = createApp();
      const vnode = toVNode(app);
      const stream = renderToStream(vnode);
      const html = await streamToString(stream);
      const css = collectCSS(themeCss, module);

      // Serialize resolved query data for client-side hydration
      const ssrData =
        resolvedQueries.length > 0
          ? resolvedQueries.map(({ key, data }) => ({
              key,
              data: JSON.parse(JSON.stringify(data)),
            }))
          : [];

      return { html, css, ssrData };
    } finally {
      clearGlobalSSRTimeout();
    }
  });
}

/**
 * Discover queries for a given URL without rendering.
 * Runs only Pass 1 (query registration + resolution), no Pass 2 render.
 * Used by the production handler to pre-fetch query data for client-side navigations.
 */
export async function ssrDiscoverQueries(
  module: SSRModule,
  url: string,
  options?: { ssrTimeout?: number },
): Promise<SSRDiscoverResult> {
  const normalizedUrl = url.endsWith('/index.html')
    ? url.slice(0, -'/index.html'.length) || '/'
    : url;

  const ssrTimeout = options?.ssrTimeout ?? 300;

  ensureDomShim();
  const ctx = createRequestContext(normalizedUrl);

  return ssrStorage.run(ctx, async () => {
    try {
      setGlobalSSRTimeout(ssrTimeout);

      const createApp = resolveAppFactory(module);

      // Pass 1 only: Discovery — triggers query() registrations
      createApp();

      // Await registered SSR queries with per-query timeouts
      const queries = getSSRQueries();
      const resolvedQueries: Array<{ key: string; data: unknown }> = [];
      const pendingKeys: string[] = [];
      if (queries.length > 0) {
        await Promise.allSettled(
          queries.map(({ promise, timeout, resolve, key }) => {
            let settled = false;
            return Promise.race([
              promise.then((data) => {
                if (settled) return 'late';
                settled = true;
                resolve(data);
                resolvedQueries.push({ key, data });
                return 'resolved';
              }),
              new Promise((r) => setTimeout(r, timeout || ssrTimeout)).then(() => {
                if (settled) return 'already-resolved';
                settled = true;
                pendingKeys.push(key);
                return 'timeout';
              }),
            ]);
          }),
        );
      }

      return {
        resolved: resolvedQueries.map(({ key, data }) => ({
          key,
          data: JSON.parse(JSON.stringify(data)),
        })),
        pending: pendingKeys,
      };
    } finally {
      clearGlobalSSRTimeout();
    }
  });
}

/**
 * Stream nav query results as individual SSE events.
 *
 * Unlike `ssrDiscoverQueries` which buffers all results, this function
 * returns a `ReadableStream` that emits each query result as it settles:
 * - `event: data` for resolved queries (with key + data)
 * - `event: done` when all queries have settled
 *
 * Timed-out or rejected queries are silently dropped (no event sent).
 * The client's `doneHandler` detects missing data and falls back to
 * client-side fetch.
 *
 * The render lock is released after query discovery (Pass 1), before
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

  ensureDomShim();
  const ctx = createRequestContext(normalizedUrl);
  const queries = await ssrStorage.run(ctx, async () => {
    try {
      setGlobalSSRTimeout(ssrTimeout);

      const createApp = resolveAppFactory(module);

      // Pass 1 only: Discovery
      createApp();

      const discovered = getSSRQueries();

      return discovered.map((q) => ({
        promise: q.promise,
        timeout: q.timeout || ssrTimeout,
        resolve: q.resolve,
        key: q.key,
      }));
    } finally {
      clearGlobalSSRTimeout();
    }
  });

  // No queries — return a stream with just the done event
  if (queries.length === 0) {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
        controller.close();
      },
    });
  }

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
          (data) => {
            if (settled) return;
            settled = true;
            resolve(data);
            const entry = { key, data: JSON.parse(JSON.stringify(data)) };
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
