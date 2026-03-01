/**
 * Reusable SSR rendering functions for both dev (virtual entry) and production.
 *
 * Extracts the two-pass render logic from the Vite virtual SSR entry into
 * real TypeScript functions that can be imported directly.
 */

import { compileTheme, type Theme } from '@vertz/ui';
import { installDomShim, removeDomShim, SSRElement, toVNode } from './dom-shim';
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
 * To bridge the gap, the SSR module can export `getInjectedCSS` from
 * @vertz/ui, giving us access to the bundled instance's tracked CSS.
 * Falls back to reading from the DOM shim's document.head.
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

  // Prefer the module's getInjectedCSS (bundled @vertz/ui instance)
  let componentCss: string[];
  if (module.getInjectedCSS) {
    componentCss = module.getInjectedCSS().filter((s) => !alreadyIncluded.has(s));
  } else {
    // Fallback: read CSS from DOM shim's document.head
    componentCss = [];
    // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
    const head = (globalThis as any).document?.head;
    if (head instanceof SSRElement) {
      for (const child of head.children) {
        if (
          child instanceof SSRElement &&
          child.tag === 'style' &&
          'data-vertz-css' in child.attrs &&
          child.textContent &&
          !alreadyIncluded.has(child.textContent)
        ) {
          componentCss.push(child.textContent);
        }
      }
    }
  }

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

      // Sync any module-level routers to the current request URL.
      // Routers created at module import time (before __SSR_URL__ is set)
      // remain stuck on their initial URL without this call.
      // biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
      (globalThis as any).__VERTZ_SSR_SYNC_ROUTER__?.(normalizedUrl);

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
      // NOTE: Do NOT call resetInjectedStyles() here.
      // In Cloudflare Workers, wrangler deduplicates @vertz/ui into a single
      // module instance shared between the app and @vertz/ui-server. Clearing
      // injectedCSS would permanently destroy component CSS from module-level
      // css() calls (which only run once at import time). The injectedCSS Set
      // naturally deduplicates, so CSS from previous renders doesn't leak.
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

      // Sync module-level routers (same reason as ssrRenderToString)
      // biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
      (globalThis as any).__VERTZ_SSR_SYNC_ROUTER__?.(normalizedUrl);

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
      // NOTE: Do NOT call resetInjectedStyles() — same reason as ssrRenderToStringUnsafe.
      removeDomShim();
      // biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
      delete (globalThis as any).__SSR_URL__;
    }
  });
}
