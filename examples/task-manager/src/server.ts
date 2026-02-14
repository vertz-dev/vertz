/**
 * Development server with Vite SSR middleware.
 * 
 * Uses Vite's ssrLoadModule to transform and execute entry-server.ts
 * with the server-side JSX runtime.
 * 
 * Start with: bun src/server.ts
 */

import { createServer as createViteServer } from 'vite';
import { createServer as createHttpServer } from 'http';

const PORT = 5173;
const HOST = '0.0.0.0';

async function startServer() {
  console.log('[Server] Starting Vite SSR dev server...');

  // Create Vite dev server in middleware mode
  let vite;
  try {
    vite = await createViteServer({
      server: {
        middlewareMode: true,
      },
      appType: 'custom',
    });
    console.log('[Server] Vite dev server created');
  } catch (err) {
    console.error('[Server] Failed to create Vite server:', err);
    throw err;
  }

  // Use Vite's connect middleware stack
  vite.middlewares.use(async (req, res, next) => {
    const url = req.url || '/';
    
    try {
      // Skip Vite's internal routes
      if (url.startsWith('/@') || url.startsWith('/node_modules') || url.startsWith('/src/')) {
        return next();
      }

      console.log(`[Server] Rendering: ${url}`);

      // Invalidate all SSR modules so each request gets fresh state
      // (router, settings, etc. need to reinitialize per request with correct URL)
      for (const mod of vite.moduleGraph.idToModuleMap.values()) {
        if (mod.ssrModule) {
          vite.moduleGraph.invalidateModule(mod);
        }
      }
      
      // Load the entry-server module with SSR transform
      const { renderToString } = await vite.ssrLoadModule('/src/entry-server.ts');
      
      // Render the app to HTML
      const html = await renderToString(url);
      
      // Transform the HTML template (injects HMR client, etc.)
      const transformedHtml = await vite.transformIndexHtml(url, html);
      
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(transformedHtml);
    } catch (err) {
      console.error('[Server] SSR error:', err);
      
      // Fix stack trace for better error messages
      if (err instanceof Error) {
        vite.ssrFixStacktrace(err);
      }
      
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end((err as Error).stack || String(err));
    }
  });

  // Create HTTP server with Vite middleware
  const server = createHttpServer(vite.middlewares);

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server] Port ${PORT} is already in use`);
    } else {
      console.error(`[Server] Server error:`, err);
    }
    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    console.log(`[Server] Running at http://${HOST}:${PORT}`);
    console.log(`[Server] Local: http://localhost:${PORT}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM received, closing...');
    server.close();
    vite.close();
  });
}

startServer().catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});
