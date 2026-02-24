import { compileTheme, type Theme } from '@vertz/ui';
import { installDomShim, removeDomShim, SSRElement } from './dom-shim';
import { renderPage } from './render-page';
import {
  clearGlobalSSRTimeout,
  getSSRQueries,
  type SSRQueryEntry,
  setGlobalSSRTimeout,
  ssrStorage,
} from './ssr-context';
import { createSSRDataChunk, getStreamingRuntimeScript } from './ssr-streaming-runtime';
import { encodeChunk } from './streaming';
import type { VNode } from './types';

export interface RenderToHTMLOptions<AppFn extends () => VNode> {
  /** The app component function */
  app: AppFn;
  /** Request URL for SSR */
  url: string;
  /** Theme definition for CSS vars */
  theme?: Theme;
  /** Global CSS strings to inject */
  styles?: string[];
  /** HTML head configuration */
  head?: {
    title?: string;
    meta?: Array<{ name?: string; property?: string; content: string }>;
    links?: Array<{ rel: string; href: string }>;
  };
  /** Container selector (default '#app') */
  container?: string;
}

export interface RenderToHTMLStreamOptions<AppFn extends () => VNode>
  extends RenderToHTMLOptions<AppFn> {
  /** CSP nonce for inline scripts */
  nonce?: string;
  /** Global default for per-query ssrTimeout (ms) */
  ssrTimeout?: number;
  /** Hard timeout for entire stream (ms, default 30000) */
  streamTimeout?: number;
}

/**
 * Perform the two-pass SSR render and return the initial HTML string
 * along with the list of unresolved queries for streaming.
 */
async function twoPassRender<AppFn extends () => VNode>(
  options: RenderToHTMLStreamOptions<AppFn>,
): Promise<{ html: string; pendingQueries: SSRQueryEntry[] }> {
  // Pass 1: Discover queries — call app() to trigger query() registrations.
  options.app();

  // Await all registered SSR queries with per-query timeout.
  // Fast queries populate their signals; slow queries keep loading=true.
  const queries = getSSRQueries();
  if (queries.length > 0) {
    await Promise.allSettled(
      queries.map((entry) =>
        Promise.race([
          entry.promise.then((data) => {
            entry.resolve(data);
            entry.resolved = true;
          }),
          new Promise<void>((r) => setTimeout(r, entry.timeout)),
        ]),
      ),
    );
    // Clear queries to avoid re-processing in the second pass
    const store = ssrStorage.getStore();
    if (store) store.queries = [];
  }

  // Collect unresolved queries before pass 2 (they need streaming)
  const pendingQueries = queries.filter((q) => !q.resolved);

  // Pass 2: Render with data — signals now have resolved values.
  const vnode = options.app();

  // Collect CSS injected into fake document.head during render
  // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
  const fakeDoc = (globalThis as any).document;
  const collectedCSS: string[] = [];
  if (fakeDoc?.head?.children) {
    for (const child of fakeDoc.head.children) {
      if (child instanceof SSRElement && child.tag === 'style') {
        const cssText = child.children?.join('') ?? '';
        if (cssText) collectedCSS.push(cssText);
      }
    }
  }

  // Compile theme CSS
  const themeCss = options.theme ? compileTheme(options.theme).css : '';

  // Combine: theme + explicit styles + collected component CSS
  const allStyles = [themeCss, ...(options.styles ?? []), ...collectedCSS].filter(Boolean);

  // Build head entries for styles
  const styleTags = allStyles.map((css) => `<style>${css}</style>`).join('\n');

  // Build meta tags
  const metaHtml =
    options.head?.meta
      ?.map(
        (m) =>
          `<meta ${m.name ? `name="${m.name}"` : `property="${m.property}"`} content="${m.content}">`,
      )
      .join('\n') ?? '';

  // Build link tags
  const linkHtml =
    options.head?.links?.map((link) => `<link rel="${link.rel}" href="${link.href}">`).join('\n') ??
    '';

  // Inject streaming runtime script into head when there are pending queries
  const runtimeScript = pendingQueries.length > 0 ? getStreamingRuntimeScript(options.nonce) : '';

  // Combine head content: meta + links + styles + streaming runtime
  const headContent = [metaHtml, linkHtml, styleTags, runtimeScript].filter(Boolean).join('\n');

  // Call renderPage with the pre-rendered VNode
  const response = renderPage(vnode, {
    title: options.head?.title,
    head: headContent,
  });

  const html = await response.text();
  return { html, pendingQueries };
}

/**
 * Render a component to a streaming HTML Response.
 *
 * The initial HTML is sent immediately. For slow queries that timed out
 * during SSR, their resolved data is streamed as inline `<script>` chunks
 * that push data to the client's reactive system.
 *
 * @returns Promise<Response> - A streaming Response with text/html content
 */
export async function renderToHTMLStream<AppFn extends () => VNode>(
  options: RenderToHTMLStreamOptions<AppFn>,
): Promise<Response> {
  installDomShim();

  const streamTimeout = options.streamTimeout ?? 30_000;

  return ssrStorage.run({ url: options.url, errors: [], queries: [] }, async () => {
    try {
      // Set global ssrTimeout if provided
      if (options.ssrTimeout !== undefined) {
        setGlobalSSRTimeout(options.ssrTimeout);
      }

      const { html, pendingQueries } = await twoPassRender(options);

      // No pending queries — return a simple non-streaming response
      if (pendingQueries.length === 0) {
        clearGlobalSSRTimeout();
        removeDomShim();
        return new Response(html, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }

      // Cleanup is safe now — the two-pass render is done and the streaming
      // phase only serializes data (no DOM shim or SSR context needed).
      clearGlobalSSRTimeout();
      removeDomShim();

      // Unique sentinel for timeout detection (not a string that could collide with data)
      const TIMEOUT_SENTINEL = Symbol('stream-timeout');

      // Stream: initial HTML + data chunks for pending queries
      let closed = false;
      let hardTimeoutId: ReturnType<typeof setTimeout> | undefined;

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          // Enqueue initial HTML
          controller.enqueue(encodeChunk(html));

          // Race all pending queries against the hard timeout
          const hardTimeout = new Promise<typeof TIMEOUT_SENTINEL>((r) => {
            hardTimeoutId = setTimeout(() => r(TIMEOUT_SENTINEL), streamTimeout);
          });

          // Stream each pending query as it resolves
          const streamPromises = pendingQueries.map(async (entry) => {
            try {
              const result = await Promise.race([entry.promise, hardTimeout]);
              if (result === TIMEOUT_SENTINEL || closed) return;
              const chunk = createSSRDataChunk(entry.key, result, options.nonce);
              controller.enqueue(encodeChunk(chunk));
            } catch {
              // Query rejected — skip, client will fetch
            }
          });

          // Wait for all queries to either resolve, reject, or timeout
          await Promise.race([Promise.allSettled(streamPromises), hardTimeout]);

          if (hardTimeoutId !== undefined) clearTimeout(hardTimeoutId);
          closed = true;
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    } catch (err) {
      clearGlobalSSRTimeout();
      removeDomShim();
      throw err;
    }
  });
}

/**
 * Render a VNode to a full HTML string.
 *
 * This is a wrapper around renderPage() that provides a simpler API for
 * theme and style injection.
 *
 * @param options - Render options including app, url, theme, styles, head
 * @returns Promise<string> - The rendered HTML string
 *
 * @example
 * ```ts
 * import { renderToHTML, defineTheme } from '@vertz/ui-server';
 *
 * const theme = defineTheme({
 *   colors: { primary: { DEFAULT: '#3b82f6' } }
 * });
 *
 * const html = await renderToHTML({
 *   app: App,
 *   url: '/',
 *   theme,
 *   styles: ['body { margin: 0; }'],
 *   head: { title: 'My App' }
 * });
 * ```
 */
export async function renderToHTML<AppFn extends () => VNode>(
  options: RenderToHTMLOptions<AppFn>,
): Promise<string>;
/**
 * @deprecated Use the options-object overload: `renderToHTML({ app, url, ... })`
 */
export async function renderToHTML<AppFn extends () => VNode>(
  app: AppFn,
  options: RenderToHTMLOptions<AppFn>,
): Promise<string>;
export async function renderToHTML<AppFn extends () => VNode>(
  appOrOptions: AppFn | RenderToHTMLOptions<AppFn>,
  maybeOptions?: RenderToHTMLOptions<AppFn>,
): Promise<string> {
  // Support both signatures: renderToHTML(options) and renderToHTML(app, options)
  const options: RenderToHTMLOptions<AppFn> =
    typeof appOrOptions === 'function'
      ? { ...(maybeOptions as RenderToHTMLOptions<AppFn>), app: appOrOptions }
      : appOrOptions;

  // Direct path: uses twoPassRender without streaming overhead.
  // This avoids creating a ReadableStream, encoding to Uint8Array, then decoding back.
  installDomShim();
  return ssrStorage.run({ url: options.url, errors: [], queries: [] }, async () => {
    try {
      const { html } = await twoPassRender(options);
      return html;
    } finally {
      clearGlobalSSRTimeout();
      removeDomShim();
    }
  });
}
