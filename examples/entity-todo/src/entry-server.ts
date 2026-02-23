/**
 * Server-side entry point for Entity Todo SSR on Cloudflare Workers.
 *
 * Renders the App component to HTML using @vertz/ui-server primitives.
 *
 * Note: This requires the Vite plugin to be configured for SSR mode,
 * which swaps the JSX runtime from @vertz/ui (DOM) to @vertz/ui-server (VNodes).
 */

import { renderPage, renderToHTML } from '@vertz/ui-server';
import { App } from './app';
import { globalStyles } from './styles/global';
import { todoTheme } from './styles/theme';

/**
 * Render the app to a full HTML Response.
 *
 * When built with Vite SSR mode, App() returns VNodes (not DOM elements).
 * The renderPage function wraps the VNode tree in a complete HTML document.
 *
 * @returns Response with text/html content-type
 */
export async function renderApp(): Promise<Response> {
  try {
    // In SSR mode, App() returns VNodes (not DOM elements)
    // This works because the @vertz/ui-compiler swaps the JSX runtime
    // to @vertz/ui-server/jsx-runtime when building for SSR
    return renderPage(App() as never, {
      title: 'Entity Todo',
      description: 'A demo app showcasing vertz SSR on Cloudflare Workers',
      lang: 'en',
      scripts: ['/assets/client.js'],
      // Include critical CSS inline for faster FCP
      styles: ['/assets/client.css'],
      head: `<style data-vertz-css>${globalStyles.css}</style>`,
    });
  } catch (error) {
    // SSR error - return fallback HTML that loads the client bundle (SPA fallback)
    console.error('[SSR] Failed to render app:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    const response = new Response(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Entity Todo</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="A demo app showcasing vertz SSR on Cloudflare Workers">
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; }
    .error { background: #fee; border: 1px solid #fcc; padding: 1rem; border-radius: 4px; }
    .error h1 { color: #c00; margin-top: 0; }
  </style>
</head>
<body>
  <div class="error">
    <h1>Server Error</h1>
    <p>Unable to render the page. Loading client-side version instead.</p>
    <p><small>Error: ${errorMessage}</small></p>
  </div>
  <script type="module" src="/assets/client.js"></script>
</body>
</html>`,
      {
        status: 500,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Content-Security-Policy':
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
        },
      },
    );

    return response;
  }
}

/**
 * Render the app to an HTML string.
 *
 * This function is used by createDevServer for SSR in local development.
 * It renders the App component to a complete HTML document string.
 *
 * @param url - The request URL for routing/SSR context
 * @returns Promise<string> - The rendered HTML string
 */
export async function renderToString(url: string): Promise<string> {
  try {
    let html = await renderToHTML(App, {
      url,
      theme: todoTheme,
      styles: [globalStyles.css],
      head: {
        title: 'Entity Todo',
        meta: [
          { name: 'description', content: 'A demo app showcasing vertz SSR on Cloudflare Workers' },
        ],
      },
    });

    // Wrap SSR content in #app container for client-side mount(App, '#app')
    html = html.replace('<body>\n', '<body>\n<div id="app">');
    html = html.replace('\n</body>', '</div>\n</body>');

    // Inject client entry script for hydration (Vite resolves the path in dev mode)
    html = html.replace(
      '</body>',
      '  <script type="module" src="/src/entry-client.ts"></script>\n</body>',
    );

    return html;
  } catch (error) {
    // SSR error - return fallback HTML
    console.error('[SSR] Failed to render:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Entity Todo</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="A demo app showcasing vertz SSR on Cloudflare Workers">
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; }
    .error { background: #fee; border: 1px solid #fcc; padding: 1rem; border-radius: 4px; }
    .error h1 { color: #c00; margin-top: 0; }
  </style>
</head>
<body>
  <div class="error">
    <h1>Server Error</h1>
    <p>Unable to render the page. Loading client-side version instead.</p>
    <p><small>Error: ${errorMessage}</small></p>
  </div>
  <script type="module" src="/assets/client.js"></script>
</body>
</html>`;
  }
}
