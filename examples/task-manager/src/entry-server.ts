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
 * Render the app to an HTML stream for the given URL.
 */
export async function render(url: string): Promise<ReadableStream<Uint8Array>> {
  // Set the SSR URL BEFORE installing DOM shim (shim reads it for window.location)
  (globalThis as any).__SSR_URL__ = url;
  
  // Install DOM shim so @vertz/ui library functions work
  installDomShim();
  
  try {
    // Import App dynamically to ensure the DOM shim is installed first
    // (module-level code in router.ts, settings-context.ts etc. may run)
    const { App } = await import('./app');
    
    // Call the REAL App component
    // The result may be a VNode (from JSX) or an SSRElement (from DOM shim)
    const appResult = App();
    
    // Convert to VNode if needed
    const appVNode = toVNode(appResult);
    
    // Render the VNode tree to a stream
    return renderToStream(appVNode);
  } finally {
    // Clean up
    delete (globalThis as any).__SSR_URL__;
    removeDomShim();
  }
}

/**
 * Render the full HTML document with the app content.
 */
export async function renderToString(url: string): Promise<string> {
  const appStream = await render(url);
  const appHtml = await streamToString(appStream);

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
