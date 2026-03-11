/**
 * Shared HTML generation for SSR.
 *
 * Used by both the dev server (SSR mode) and production SSR handler
 * to generate complete HTML documents from SSR render results.
 */

import { escapeAttr, escapeHtml } from './html-serializer';

export interface GenerateSSRHtmlOptions {
  appHtml: string;
  css: string;
  ssrData: Array<{ key: string; data: unknown }>;
  clientEntry: string;
  title?: string;
  /** Extra HTML tags to inject into <head> before CSS (e.g., font preloads). */
  headTags?: string;
  /** Paths to inject as `<link rel="modulepreload">` in `<head>`. */
  modulepreload?: string[];
}

/**
 * Generate a complete HTML document from SSR render results.
 */
export function generateSSRHtml(options: GenerateSSRHtmlOptions): string {
  const {
    appHtml,
    css,
    ssrData,
    clientEntry,
    title = 'Vertz App',
    headTags: rawHeadTags = '',
    modulepreload,
  } = options;

  const modulepreloadTags = modulepreload?.length
    ? modulepreload.map((p) => `<link rel="modulepreload" href="${escapeAttr(p)}">`).join('\n')
    : '';

  const headTags = [rawHeadTags, modulepreloadTags].filter(Boolean).join('\n');

  const ssrDataScript =
    ssrData.length > 0
      ? `<script>window.__VERTZ_SSR_DATA__ = ${JSON.stringify(ssrData)};</script>`
      : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    ${headTags}
    ${css}
  </head>
  <body>
    <div id="app">${appHtml}</div>
    ${ssrDataScript}
    <script type="module" src="${escapeAttr(clientEntry)}"></script>
  </body>
</html>`;
}
