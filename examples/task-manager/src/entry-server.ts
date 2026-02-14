/**
 * Server entry point for SSR.
 * 
 * Renders the task-manager app to HTML using @vertz/ui-server.
 * 
 * Strategy: Install a minimal DOM shim so @vertz/ui library functions
 * (createLink, ThemeProvider, effect, etc.) work on the server.
 * The shim produces SSRElement objects that can be converted to VNodes.
 * The JSX runtime (jsx-runtime-server.ts) produces VNodes directly.
 */

import { renderToStream, streamToString } from '@vertz/ui-server';
import type { VNode } from '@vertz/ui-server';
import { installDomShim, removeDomShim, toVNode } from './dom-shim';

/**
 * Simple route pattern matcher for SSR router fix.
 * Matches a URL path against a pattern like "/tasks/:id".
 */
function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  
  if (patternParts.length !== pathParts.length) {
    // Special case: root pattern '/' matches empty path
    if (pattern === '/' && pathParts.length === 0) {
      return {};
    }
    return null;
  }
  
  const params: Record<string, string> = {};
  
  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];
    
    if (patternPart.startsWith(':')) {
      // This is a parameter
      params[patternPart.slice(1)] = pathPart;
    } else if (patternPart !== pathPart) {
      // Literal parts must match exactly
      return null;
    }
  }
  
  return params;
}

/**
 * Render the app to an HTML stream for the given URL.
 */
export async function render(url: string): Promise<ReadableStream<Uint8Array>> {
  // Set the SSR URL BEFORE installing DOM shim (shim reads it for window.location)
  (globalThis as any).__SSR_URL__ = url;
  
  // Install DOM shim so @vertz/ui library functions work
  installDomShim();
  
  // CRITICAL FIX: Update router match BEFORE importing App
  // This prevents triggering effects after the app tree is already built.
  // When router.ts is cached from a previous render, its match is stale.
  const routerModule = await import('./router');
  const cleanPath = url.split('?')[0].split('#')[0];
  
  // Try to match each route pattern
  let matchedRoute = null;
  for (const route of routerModule.routes) {
    const params = matchPattern(route.pattern, cleanPath);
    if (params !== null) {
      matchedRoute = {
        params,
        route,
        matched: [{ route, params }],
        searchParams: new URLSearchParams(),
        search: {},
      };
      break;
    }
  }
  
  // Update the router's current match signal directly
  routerModule.appRouter.current.value = matchedRoute;
  
  // NOW import App - the router already has the correct match
  const { App } = await import('./app');
  
  // Call the REAL App component
  // The result may be a VNode (from JSX) or an SSRElement (from DOM shim)
  const appResult = App();
  
  // Convert to VNode if needed
  const appVNode = toVNode(appResult);
  
  // Render the VNode tree to a stream
  // NOTE: DO NOT remove DOM shim here! Effects may still be running.
  // The shim will remain installed for the entire server process,
  // which is fine since it's per-request in SSR mode (checked by __SSR_URL__).
  return renderToStream(appVNode);
}

/**
 * Render the full HTML document with the app content.
 */
export async function renderToString(url: string): Promise<string> {
  const appStream = await render(url);
  const appHtml = await streamToString(appStream);

  // NOTE: We do NOT remove the DOM shim or __SSR_URL__ after rendering.
  // In SSR with Vite's ssrLoadModule, each request gets its own module instance,
  // so global state is already isolated. Effects may continue running after
  // streamToString completes, and they need the DOM shim to be present.
  // The next request will re-install the shim with a new URL anyway.

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Task Manager — @vertz/ui demo</title>
  </head>
  <body>
    <div id="app">${appHtml}</div>
    <script type="module" src="/src/entry-client.ts"></script>
  </body>
</html>`;
}
