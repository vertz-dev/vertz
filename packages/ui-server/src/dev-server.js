/**
 * Development server abstraction for Vite SSR.
 *
 * Provides a turnkey dev server with:
 * - Vite middleware mode
 * - SSR module loading with transformation
 * - Module invalidation per request
 * - HTML transformation (HMR injection)
 * - Error stack fixing
 * - HTTP server creation
 * - Graceful shutdown
 *
 * @example
 * ```ts
 * import { createDevServer } from '@vertz/ui-server';
 *
 * createDevServer({
 *   entry: './src/entry-server.ts',
 *   port: 5173,
 * }).listen();
 * ```
 */
import { createServer as createHttpServer } from 'node:http';
import { InternalServerErrorException } from '@vertz/server';
import { createServer as createViteServer } from 'vite';
/**
 * Create a Vite SSR development server.
 */
export function createDevServer(options) {
  const {
    entry,
    port = 5173,
    host = '0.0.0.0',
    viteConfig = {},
    middleware,
    skipModuleInvalidation = false,
    logRequests = true,
  } = options;
  let vite;
  let httpServer;
  const listen = async () => {
    if (logRequests) {
      console.log('[Server] Starting Vite SSR dev server...');
    }
    // Create Vite dev server in middleware mode
    try {
      vite = await createViteServer({
        ...viteConfig,
        server: {
          ...viteConfig.server,
          middlewareMode: true,
        },
        appType: 'custom',
      });
      if (logRequests) {
        console.log('[Server] Vite dev server created');
      }
    } catch (err) {
      console.error('[Server] Failed to create Vite server:', err);
      throw err;
    }
    // Apply custom middleware if provided
    if (middleware) {
      vite.middlewares.use(middleware);
    }
    // SSR request handler
    vite.middlewares.use(async (req, res, next) => {
      const url = req.url || '/';
      try {
        // Skip Vite's internal routes
        if (url.startsWith('/@') || url.startsWith('/node_modules')) {
          return next();
        }
        // Skip entry point (it's handled by the client)
        if (url === entry || url.startsWith('/src/')) {
          return next();
        }
        if (logRequests) {
          console.log(`[Server] Rendering: ${url}`);
        }
        // Invalidate all SSR modules so each request gets fresh state
        if (!skipModuleInvalidation) {
          for (const mod of vite.moduleGraph.idToModuleMap.values()) {
            if (mod.ssrModule) {
              vite.moduleGraph.invalidateModule(mod);
            }
          }
        }
        // Load the entry-server module with SSR transform
        const entryModule = await vite.ssrLoadModule(entry);
        if (!entryModule.renderToString) {
          throw new InternalServerErrorException(
            `Entry module "${entry}" does not export a renderToString function`,
          );
        }
        // Render the app to HTML
        const html = await entryModule.renderToString(url);
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
        res.end(err.stack || String(err));
      }
    });
    // Create HTTP server with Vite middleware
    httpServer = createHttpServer(vite.middlewares);
    httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[Server] Port ${port} is already in use`);
      } else {
        console.error(`[Server] Server error:`, err);
      }
      process.exit(1);
    });
    await new Promise((resolve) => {
      httpServer.listen(port, host, () => {
        if (logRequests) {
          console.log(`[Server] Running at http://${host}:${port}`);
          console.log(`[Server] Local: http://localhost:${port}`);
        }
        resolve();
      });
    });
    // Graceful shutdown
    const shutdown = () => {
      if (logRequests) {
        console.log('[Server] Shutting down...');
      }
      httpServer.close();
      vite.close();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  };
  const close = async () => {
    if (httpServer) {
      await new Promise((resolve, reject) => {
        httpServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    if (vite) {
      await vite.close();
    }
  };
  return {
    listen,
    close,
    get vite() {
      return vite;
    },
    get httpServer() {
      return httpServer;
    },
  };
}
//# sourceMappingURL=dev-server.js.map
