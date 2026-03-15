/**
 * Shared HTML template injection utility.
 *
 * Used by both the production SSR handler (runtime) and the pre-render pipeline (build-time).
 */

import { safeSerialize } from './ssr-streaming-runtime';

export interface InjectIntoTemplateOptions {
  template: string;
  appHtml: string;
  appCss: string;
  ssrData: Array<{ key: string; data: unknown }>;
  nonce?: string;
  headTags?: string;
  /** Pre-built session + access set script tags for SSR injection. */
  sessionScript?: string;
}

/**
 * Inject SSR output into the HTML template.
 *
 * Replaces <!--ssr-outlet--> or <div id="app"> content with rendered HTML,
 * injects CSS before </head>, and ssrData before </body>.
 */
export function injectIntoTemplate(options: InjectIntoTemplateOptions): string {
  const { template, appHtml, appCss, ssrData, nonce, headTags, sessionScript } = options;

  // Inject app HTML: try <!--ssr-outlet--> first, then <div id="app">
  let html: string;
  if (template.includes('<!--ssr-outlet-->')) {
    html = template.replace('<!--ssr-outlet-->', appHtml);
  } else {
    html = replaceAppDivContent(template, appHtml);
  }

  // Inject head tags (e.g., font preloads) before CSS
  if (headTags) {
    html = html.replace('</head>', `${headTags}\n</head>`);
  }

  // Inject CSS before </head>
  if (appCss) {
    // When inline CSS is injected, linked stylesheets become redundant for
    // first paint. Convert them to async loading to avoid render-blocking.
    html = html.replace(
      /<link\s+rel="stylesheet"\s+href="([^"]+)"[^>]*>/g,
      (match, href) =>
        `<link rel="stylesheet" href="${href}" media="print" onload="this.media='all'">\n    <noscript>${match}</noscript>`,
    );
    html = html.replace('</head>', `${appCss}\n</head>`);
  }

  // Inject session script before </body> (before ssrData, before app bundle)
  if (sessionScript) {
    html = html.replace('</body>', `${sessionScript}\n</body>`);
  }

  // Inject SSR data for client-side hydration before </body>
  if (ssrData.length > 0) {
    const nonceAttr = nonce != null ? ` nonce="${nonce}"` : '';
    const ssrDataScript = `<script${nonceAttr}>window.__VERTZ_SSR_DATA__=${safeSerialize(ssrData)};</script>`;
    html = html.replace('</body>', `${ssrDataScript}\n</body>`);
  }

  return html;
}

/**
 * Replace the content of `<div id="app">...</div>` with new HTML.
 *
 * Uses balanced div-tag counting to find the matching closing `</div>`,
 * handling arbitrarily nested content from pre-rendered SSR templates.
 * A simple regex with non-greedy `[\s\S]*?` fails because it stops at
 * the first `</div>` inside nested layout components (e.g., sidebar nav),
 * orphaning the rest of the old SSR content.
 */
function replaceAppDivContent(template: string, appHtml: string): string {
  const openMatch = template.match(/<div[^>]*id="app"[^>]*>/);
  if (!openMatch || openMatch.index == null) return template;

  const openTag = openMatch[0];
  const contentStart = openMatch.index + openTag.length;

  // Walk forward from the opening tag, counting balanced <div>...</div> pairs
  let depth = 1;
  let i = contentStart;
  const len = template.length;

  while (i < len && depth > 0) {
    if (template[i] === '<') {
      if (template.startsWith('</div>', i)) {
        depth--;
        if (depth === 0) break;
        i += 6; // skip </div>
      } else if (template.startsWith('<div', i) && /^<div[\s>]/.test(template.slice(i, i + 5))) {
        depth++;
        i += 4; // skip <div
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  if (depth !== 0) {
    // Couldn't find matching </div> — fall back to simple replacement
    return template;
  }

  // i points to the '<' of the matching </div>
  return template.slice(0, contentStart) + appHtml + template.slice(i);
}
