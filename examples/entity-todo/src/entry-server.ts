/**
 * Server-side entry point for Entity Todo SSR on Cloudflare Workers.
 *
 * Renders the App component to HTML using @vertz/ui-server primitives.
 * 
 * Note: This requires the Vite plugin to be configured for SSR mode,
 * which swaps the JSX runtime from @vertz/ui (DOM) to @vertz/ui-server (VNodes).
 */

import { renderPage } from '@vertz/ui-server';
import { App } from './app';

/**
 * Render the app to a full HTML Response.
 * 
 * When built with Vite SSR mode, App() returns VNodes instead of DOM elements.
 * The renderPage function wraps the VNode tree in a complete HTML document.
 *
 * @returns Response with text/html content-type
 */
export async function renderApp(): Promise<Response> {
  // In SSR mode, App() returns VNodes (not DOM elements)
  // This works because the @vertz/ui-compiler swaps the JSX runtime
  // to @vertz/ui-server/jsx-runtime when building for SSR
  return renderPage(App() as never, {
    title: 'Entity Todo',
    description: 'A demo app showcasing vertz SSR on Cloudflare Workers',
    lang: 'en',
    scripts: ['/assets/client.js'],
    styles: ['/assets/client.css'],
  });
}
