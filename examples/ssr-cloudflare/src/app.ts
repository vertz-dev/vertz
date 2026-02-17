/**
 * SSR Cloudflare example — demonstrates API + SSR with vertz.
 * 
 * NOTE: Full SSR with @vertz/ui-server requires additional bundler configuration
 * for Cloudflare Workers. This simplified version demonstrates the core adapter pattern.
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
<html>
<head>
  <title>Vertz SSR Demo</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <div style="font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem;">
    <h1>Vertz SSR Demo</h1>
    <p>Welcome to the Cloudflare Workers SSR example!</p>
    <p>API Status: <strong>OK</strong></p>
    <hr>
    <p style="color: #666;">Running on Cloudflare Workers</p>
  </div>
</body>
</html>`;
    
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  },
});

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const appModule = vertz.module(appDef, {
  routers: [appRouter],
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
