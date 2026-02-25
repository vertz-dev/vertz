/**
 * Bun production server for the Task Manager SSR app.
 *
 * Serves static files from dist/client/ and delegates HTML/nav requests
 * to the SSR handler from @vertz/ui-server.
 */

import { createSSRHandler } from '@vertz/ui-server';

const ssrModule = await import('./dist/server/index.js');
const template = await Bun.file('./dist/client/index.html').text();

const handler = createSSRHandler({
  module: ssrModule,
  template,
});

const server = Bun.serve({
  port: 3000,
  async fetch(request) {
    const url = new URL(request.url);

    // Serve static files from dist/client/
    if (url.pathname !== '/' && !url.pathname.endsWith('.html')) {
      const staticFile = Bun.file(`./dist/client${url.pathname}`);
      if (await staticFile.exists()) {
        const isHashed = url.pathname.includes('/assets/');
        return new Response(staticFile, {
          headers: {
            'Cache-Control': isHashed
              ? 'public, max-age=31536000, immutable'
              : 'public, max-age=3600',
          },
        });
      }
    }

    // SSR handler for HTML and nav pre-fetch requests
    return handler(request);
  },
});

console.log(`Production server running at http://localhost:${server.port}`);
