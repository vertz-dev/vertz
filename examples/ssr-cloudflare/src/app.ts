/**
 * SSR Cloudflare example — demonstrates API + SSR with vertz.
 */
import { vertz } from '@vertz/core';

// ---------------------------------------------------------------------------
// Module definition
// ---------------------------------------------------------------------------

const appDef = vertz.moduleDef({ name: 'app' });

// ---------------------------------------------------------------------------
// Router with API route
// ---------------------------------------------------------------------------

const appRouter = appDef.router({ prefix: '' }).get('/api/health', {
  handler: async () => {
    return { status: 'ok' };
  },
}).get('/', {
  handler: async () => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Vertz SSR Demo</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <div style="font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem;">
    <h1>Vertz on Cloudflare Workers ⚡</h1>
    <p>This page was server-side rendered with streaming.</p>
    <p>API health check: <a href="/api/health">/api/health</a></p>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  },
});

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const appModule = vertz.module(appDef, {
  services: [],
  routers: [appRouter],
  exports: [],
});

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

export const app = vertz
  .app({
    basePath: '/',
    cors: { origins: true },
  })
  .register(appModule);
