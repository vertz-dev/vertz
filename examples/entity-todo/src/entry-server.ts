/**
 * Server-side entry point for Entity Todo.
 *
 * Uses the DOM-shim approach for SSR: the compiled JSX creates SSRElement
 * instances (fake DOM), which are then converted to VNodes for serialization.
 * This matches how the Vertz compiler's built-in SSR works.
 */

import { compileTheme } from '@vertz/ui';
import { renderToStream, streamToString } from '@vertz/ui-server';
import { installDomShim, removeDomShim, toVNode } from '@vertz/ui-server/dom-shim';
import { App } from './app';
import { globalStyles } from './styles/global';
import { todoTheme } from './styles/theme';

export interface RenderOptions {
  /** Path to the client-side entry script. Defaults to '/src/entry-client.ts' (dev). */
  clientScript?: string;
}

/**
 * Render the app to an HTML string.
 *
 * Used by createDevServer for SSR in local development and by the
 * Cloudflare Worker for production SSR.
 *
 * @param url - The request URL for routing/SSR context
 * @param options - Render options (e.g. clientScript path for production)
 * @returns Promise<string> - The rendered HTML string
 */
export async function renderToString(url: string, options?: RenderOptions): Promise<string> {
  const clientScript = options?.clientScript ?? '/src/entry-client.ts';
  try {
    // Normalize URL
    const normalizedUrl = url.endsWith('/index.html')
      ? url.slice(0, -'/index.html'.length) || '/'
      : url;

    // Set SSR context flags so framework code detects SSR mode.
    // __SSR_URL__ tells the router which URL to render.
    // __VERTZ_IS_SSR__ tells domEffect/lifecycleEffect to use SSR behavior
    // (run once without tracking instead of creating reactive subscriptions).
    // biome-ignore lint/suspicious/noExplicitAny: SSR global hook
    (globalThis as any).__SSR_URL__ = normalizedUrl;
    // biome-ignore lint/suspicious/noExplicitAny: SSR global hook
    (globalThis as any).__VERTZ_IS_SSR__ = () => true;

    // Install DOM shim so __element() calls produce SSRElements
    installDomShim();

    try {
      // Call the app — produces SSRElement tree (fake DOM)
      const appElement = App();

      // Convert SSRElement → VNode tree
      const vnode = toVNode(appElement);

      // Serialize VNode to HTML string
      const stream = renderToStream(vnode);
      const appHtml = await streamToString(stream);

      // Compile theme CSS
      const themeCss = compileTheme(todoTheme).css;

      // Build full HTML document
      return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Entity Todo — vertz full-stack demo</title>
    <meta name="description" content="A demo app showcasing vertz SSR" />
    <style>${themeCss}</style>
    <style>${globalStyles.css}</style>
  </head>
  <body>
    <div id="app">${appHtml}</div>
    <script type="module" src="${clientScript}"></script>
  </body>
</html>`;
    } finally {
      removeDomShim();
      // biome-ignore lint/suspicious/noExplicitAny: SSR global cleanup
      delete (globalThis as any).__SSR_URL__;
      // biome-ignore lint/suspicious/noExplicitAny: SSR global cleanup
      delete (globalThis as any).__VERTZ_IS_SSR__;
    }
  } catch (error) {
    console.error('[SSR] Failed to render:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return `<!doctype html>
<html lang="en">
<head>
  <title>Entity Todo</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <div id="app">
    <p>Server render error: ${errorMessage}</p>
  </div>
  <script type="module" src="${clientScript}"></script>
</body>
</html>`;
  }
}
