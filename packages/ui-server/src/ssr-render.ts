/**
 * Reusable SSR rendering functions for both dev (virtual entry) and production.
 *
 * Extracts the two-pass render logic from the Vite virtual SSR entry into
 * real TypeScript functions that can be imported directly.
 */

import { compileTheme, getInjectedCSS, resetInjectedStyles, type Theme } from '@vertz/ui';
import { installDomShim, removeDomShim, toVNode } from './dom-shim';
import { renderToStream } from './render-to-stream';
import {
  clearGlobalSSRTimeout,
  getSSRQueries,
  setGlobalSSRTimeout,
  ssrStorage,
} from './ssr-context';
import { streamToString } from './streaming';

/**
 * Mutex to serialize SSR renders.
 *
 * The SSR pipeline depends on global mutable state (document, window,
 * injectedCSS set, __SSR_URL__) that cannot be isolated per-request.
 * Concurrent renders race on this state, causing crashes. A mutex ensures
 * only one render runs at a time while still being async-safe.
 */
let renderLock: Promise<unknown> = Promise.resolve();

function withRenderLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = renderLock;
  let release: () => void;
  renderLock = new Promise<void>((r) => {
    release = r;
  });
  return prev.then(fn).finally(() => release());
}

export interface SSRModule {
  default?: () => unknown;
  App?: () => unknown;
  theme?: Theme;
}

export interface SSRRenderResult {
  html: string;
  css: string;
  ssrData: Array<{ key: string; data: unknown }>;
}

export interface SSRDiscoverResult {
  resolved: Array<{ key: string; data: unknown }>;
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
 * Collect CSS from the fake document.head + component styles + theme.
 * Returns a single string with <style> tags.
 */
function collectCSS(themeCss: string): string {
  const componentStyles = getInjectedCSS()
    .map((s) => `<style data-vertz-css>${s}</style>`)
    .join('\n');
  const themeTag = themeCss ? `<style data-vertz-css>${themeCss}</style>` : '';
  return [themeTag, componentStyles].filter(Boolean).join('\n');
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
  return withRenderLock(() => ssrRenderToStringUnsafe(module, url, options));
}

async function ssrRenderToStringUnsafe(
  module: SSRModule,
  url: string,
  options?: { ssrTimeout?: number },
): Promise<SSRRenderResult> {
  const normalizedUrl = url.endsWith('/index.html')
    ? url.slice(0, -'/index.html'.length) || '/'
    : url;

  const ssrTimeout = options?.ssrTimeout ?? 300;

  return ssrStorage.run({ url: normalizedUrl, errors: [], queries: [] }, async () => {
    // biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
    (globalThis as any).__SSR_URL__ = normalizedUrl;
    installDomShim();

    // Clear the query cache before each render. In production, the SSR module
    // stays loaded across requests, so stale cache entries from previous renders
    // cause queries to skip SSR registration (they see cache hits instead).
    // biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
    (globalThis as any).__VERTZ_CLEAR_QUERY_CACHE__?.();

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
      const css = collectCSS(themeCss);

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
      resetInjectedStyles();
      removeDomShim();
      // biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
      delete (globalThis as any).__SSR_URL__;
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
  return withRenderLock(() => ssrDiscoverQueriesUnsafe(module, url, options));
}

async function ssrDiscoverQueriesUnsafe(
  module: SSRModule,
  url: string,
  options?: { ssrTimeout?: number },
): Promise<SSRDiscoverResult> {
  const normalizedUrl = url.endsWith('/index.html')
    ? url.slice(0, -'/index.html'.length) || '/'
    : url;

  const ssrTimeout = options?.ssrTimeout ?? 300;

  return ssrStorage.run({ url: normalizedUrl, errors: [], queries: [] }, async () => {
    // biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
    (globalThis as any).__SSR_URL__ = normalizedUrl;
    installDomShim();

    // Clear query cache (same reason as ssrRenderToString — stale module state)
    // biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
    (globalThis as any).__VERTZ_CLEAR_QUERY_CACHE__?.();

    try {
      setGlobalSSRTimeout(ssrTimeout);

      const createApp = resolveAppFactory(module);

      // Pass 1 only: Discovery — triggers query() registrations
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
      }

      return {
        resolved: resolvedQueries.map(({ key, data }) => ({
          key,
          data: JSON.parse(JSON.stringify(data)),
        })),
      };
    } finally {
      clearGlobalSSRTimeout();
      resetInjectedStyles();
      removeDomShim();
      // biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
      delete (globalThis as any).__SSR_URL__;
    }
  });
}
