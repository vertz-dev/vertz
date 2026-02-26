/**
 * Shared HTML generation for SSR.
 *
 * Used by both the dev server (SSR mode) and production SSR handler
 * to generate complete HTML documents from SSR render results.
 */

export interface GenerateSSRHtmlOptions {
  appHtml: string;
  css: string;
  ssrData: Array<{ key: string; data: unknown }>;
  clientEntry: string;
  title?: string;
}

/**
 * Generate a complete HTML document from SSR render results.
 */
export function generateSSRHtml(options: GenerateSSRHtmlOptions): string {
  const { appHtml, css, ssrData, clientEntry, title = 'Vertz App' } = options;

  const ssrDataScript =
    ssrData.length > 0
      ? `<script>window.__VERTZ_SSR_DATA__ = ${JSON.stringify(ssrData)};</script>`
      : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    ${css}
  </head>
  <body>
    <div id="app">${appHtml}</div>
    ${ssrDataScript}
    <script type="module" src="${clientEntry}"></script>
  </body>
</html>`;
}
