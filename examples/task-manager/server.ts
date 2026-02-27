/**
 * Bun production server for the Task Manager full-stack app.
 *
 * Serves:
 * - /api/* → @vertz/server entity API (SQLite for local prod)
 * - Static files from dist/client/
 * - /* → SSR HTML render via @vertz/ui-server
 */

import { createServer } from '@vertz/server';
import { createSSRHandler } from '@vertz/ui-server';
import { createTasksDb } from './src/db';
import { tasks } from './src/entities';

// ── API Setup ──────────────────────────────────────────

const tasksDbAdapter = createTasksDb();

const apiApp = createServer({
  basePath: '/api',
  entities: [tasks],
  db: tasksDbAdapter,
});

// ── SSR Setup ──────────────────────────────────────────

const ssrModule = await import('./dist/server/index.js');
const template = await Bun.file('./dist/client/index.html').text();

const vertzCssFile = Bun.file('./dist/client/assets/vertz.css');
const inlineCSS: Record<string, string> = {};
if (await vertzCssFile.exists()) {
  inlineCSS['/assets/vertz.css'] = await vertzCssFile.text();
}

const ssrHandler = createSSRHandler({
  module: ssrModule,
  template,
  inlineCSS,
});

// ── Server ─────────────────────────────────────────────

const server = Bun.serve({
  port: 3000,
  async fetch(request) {
    const url = new URL(request.url);

    // API routes → @vertz/server
    if (url.pathname.startsWith('/api')) {
      return apiApp.handler(request);
    }

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
    return ssrHandler(request);
  },
});

console.log(`Production server running at http://localhost:${server.port}`);
