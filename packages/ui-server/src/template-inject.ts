/**
 * Shared HTML template injection utility.
 *
 * Used by both the production SSR handler (runtime) and the pre-render pipeline (build-time).
 */

import { safeSerialize } from './ssr-streaming-runtime';

/**
 * Inject SSR output into the HTML template.
 *
 * Replaces <!--ssr-outlet--> or <div id="app"> content with rendered HTML,
 * injects CSS before </head>, and ssrData before </body>.
 */
export function injectIntoTemplate(
  template: string,
  appHtml: string,
  appCss: string,
  ssrData: Array<{ key: string; data: unknown }>,
  nonce?: string,
  headTags?: string,
): string {
  // Inject app HTML: try <!--ssr-outlet--> first, then <div id="app">
  let html: string;
  if (template.includes('<!--ssr-outlet-->')) {
    html = template.replace('<!--ssr-outlet-->', appHtml);
  } else {
    html = template.replace(/(<div[^>]*id="app"[^>]*>)([\s\S]*?)(<\/div>)/, `$1${appHtml}$3`);
  }

  // Inject head tags (e.g., font preloads) before CSS
  if (headTags) {
    html = html.replace('</head>', `${headTags}\n</head>`);
  }

  // Inject CSS before </head>
  if (appCss) {
    html = html.replace('</head>', `${appCss}\n</head>`);
  }

  // Inject SSR data for client-side hydration before </body>
  if (ssrData.length > 0) {
    const nonceAttr = nonce != null ? ` nonce="${nonce}"` : '';
    const ssrDataScript = `<script${nonceAttr}>window.__VERTZ_SSR_DATA__=${safeSerialize(ssrData)};</script>`;
    html = html.replace('</body>', `${ssrDataScript}\n</body>`);
  }

  return html;
}
