/**
 * Production SSR request handler.
 *
 * Creates a web-standard (Request) => Promise<Response> handler that:
 * - Renders SSR HTML for normal page requests
 * - Streams SSE query data for nav pre-fetch requests (X-Vertz-Nav: 1)
 *
 * Does NOT serve static files — that's the adapter/platform's job.
 */

import type { SSRModule } from './ssr-render';
import { ssrDiscoverQueries, ssrRenderToString } from './ssr-render';
import { safeSerialize } from './ssr-streaming-runtime';

export interface SSRHandlerOptions {
  /** The loaded SSR module (import('./dist/server/index.js')) */
  module: SSRModule;
  /** HTML template string (contents of dist/client/index.html) */
  template: string;
  /** SSR timeout for queries (default: 300ms) */
  ssrTimeout?: number;
  /**
   * Map of CSS asset URLs to their content for inlining.
   * Replaces `<link rel="stylesheet" href="...">` tags with inline `<style>` tags.
   * Eliminates extra network requests, preventing FOUC on slow connections.
   *
   * @example
   * ```ts
   * inlineCSS: { '/assets/vertz.css': await Bun.file('./dist/client/assets/vertz.css').text() }
   * ```
   */
  inlineCSS?: Record<string, string>;
}

/**
 * Inject SSR output into the HTML template.
 *
 * Replaces <!--ssr-outlet--> or <div id="app"> content with rendered HTML,
 * injects CSS before </head>, and ssrData before </body>.
 */
function injectIntoTemplate(
  template: string,
  appHtml: string,
  appCss: string,
  ssrData: Array<{ key: string; data: unknown }>,
): string {
  // Inject app HTML: try <!--ssr-outlet--> first, then <div id="app">
  let html: string;
  if (template.includes('<!--ssr-outlet-->')) {
    html = template.replace('<!--ssr-outlet-->', appHtml);
  } else {
    html = template.replace(/(<div[^>]*id="app"[^>]*>)([\s\S]*?)(<\/div>)/, `$1${appHtml}$3`);
  }

  // Inject CSS before </head>
  if (appCss) {
    html = html.replace('</head>', `${appCss}\n</head>`);
  }

  // Inject SSR data for client-side hydration before </body>
  if (ssrData.length > 0) {
    const ssrDataScript = `<script>window.__VERTZ_SSR_DATA__=${safeSerialize(ssrData)};</script>`;
    html = html.replace('</body>', `${ssrDataScript}\n</body>`);
  }

  return html;
}

/**
 * Create a web-standard SSR request handler.
 *
 * Handles two types of requests:
 * - X-Vertz-Nav: 1 -> SSE Response with pre-fetched query data
 * - Normal HTML request -> SSR-rendered HTML Response
 *
 * Does NOT serve static files — that's the adapter/platform's job.
 */
export function createSSRHandler(
  options: SSRHandlerOptions,
): (request: Request) => Promise<Response> {
  const { module, ssrTimeout, inlineCSS } = options;

  // Pre-process template: inline CSS assets to eliminate extra requests
  let template = options.template;
  if (inlineCSS) {
    for (const [href, css] of Object.entries(inlineCSS)) {
      const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const linkPattern = new RegExp(`<link[^>]*href=["']${escapedHref}["'][^>]*>`);
      template = template.replace(linkPattern, `<style data-vertz-css>${css}</style>`);
    }
  }

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Nav pre-fetch: SSE response
    if (request.headers.get('x-vertz-nav') === '1') {
      return handleNavRequest(module, pathname, ssrTimeout);
    }

    // Normal HTML request: SSR render
    return handleHTMLRequest(module, template, pathname, ssrTimeout);
  };
}

/**
 * Handle a nav pre-fetch request.
 * Discovers queries and streams them as SSE events.
 */
async function handleNavRequest(
  module: SSRModule,
  url: string,
  ssrTimeout?: number,
): Promise<Response> {
  try {
    const result = await ssrDiscoverQueries(module, url, { ssrTimeout });

    // Build SSE body
    let body = '';
    for (const entry of result.resolved) {
      body += `event: data\ndata: ${safeSerialize(entry)}\n\n`;
    }
    body += 'event: done\ndata: {}\n\n';

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    // Graceful degradation — still send done event so client falls back
    return new Response('event: done\ndata: {}\n\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  }
}

/**
 * Handle a normal HTML page request.
 * Renders the app via two-pass SSR and injects into the template.
 */
async function handleHTMLRequest(
  module: SSRModule,
  template: string,
  url: string,
  ssrTimeout?: number,
): Promise<Response> {
  try {
    const result = await ssrRenderToString(module, url, { ssrTimeout });
    const html = injectIntoTemplate(template, result.html, result.css, result.ssrData);

    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch {
    return new Response('Internal Server Error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
