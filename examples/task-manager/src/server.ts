/**
 * SSR server using @vertz/core.
 *
 * Serves the task-manager app with server-side rendering.
 * Uses only @vertz/core — no Express, Hono, or other external servers.
 */

import { createApp } from '@vertz/core';
import { renderToString } from './entry-server';

const app = createApp({
  basePath: '',
});

// For now, create a simple handler that responds to all routes
// In production, we'd use the module/router system from @vertz/core
const handler = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);

  // Serve static assets (in production, these would be served by Vite or a CDN)
  if (url.pathname.startsWith('/src/') || url.pathname.startsWith('/@')) {
    // Let Vite handle these in dev mode
    // In production, we'd serve from dist/
    return new Response('Not found', { status: 404 });
  }

  // SSR for all other routes
  try {
    const html = await renderToString(url.pathname);
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('SSR error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};

// Start the server
const port = parseInt(process.env.PORT || '3000', 10);

// Use the app builder's handler
Object.defineProperty(app, 'handler', {
  get: () => handler,
});

app.listen(port, { logRoutes: false }).then((server) => {
  console.log(`Task Manager SSR server running at http://${server.hostname}:${server.port}`);
});
