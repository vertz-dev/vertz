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

import { readFileSync, existsSync, watch } from 'node:fs';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer as createHttpServer } from 'node:http';
import { InternalServerErrorException } from '@vertz/server';
import type { InlineConfig, Plugin, ViteDevServer } from 'vite';
import { createServer as createViteServer } from 'vite';

/**
 * Vite plugin that swaps `@vertz/ui/jsx-runtime` → `@vertz/ui-server/jsx-runtime`
 * during SSR so that JSX produces VNodes (not DOM elements) on the server.
 *
 * This is the mechanism that makes the same component code render to both
 * DOM (client) and VNodes (server) without any user-facing guards.
 */
function vertzSSRJsxPlugin(): Plugin {
  return {
    name: 'vertz:ssr-jsx-swap',
    enforce: 'pre',
    resolveId(source, importer, options) {
      if (!options?.ssr) return;
      if (
        source === '@vertz/ui/jsx-runtime' ||
        source === '@vertz/ui/jsx-dev-runtime'
      ) {
        // Delegate to normal resolution but with the server package
        return this.resolve('@vertz/ui-server/jsx-runtime', importer, {
          ...options,
          skipSelf: true,
        });
      }
    },
  };
}

/**
 * Options for serving OpenAPI specification
 */
export interface OpenAPIOptions {
  /**
   * Path to the OpenAPI JSON spec file.
   * The spec will be served at GET /api/openapi.json
   */
  specPath: string;
}

export interface DevServerOptions {
  /**
   * Path to the SSR entry module (relative to project root).
   * This module should export a `renderToString` function.
   */
  entry: string;

  /**
   * Port to listen on.
   * @default 5173
   */
  port?: number;

  /**
   * Host to bind to.
   * @default '0.0.0.0'
   */
  host?: string;

  /**
   * Custom Vite configuration.
   * Merged with default middleware mode config.
   */
  viteConfig?: InlineConfig;

  /**
   * Custom middleware to run before SSR handler.
   * Useful for API routes, static file serving, etc.
   */
  middleware?: (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

  /**
   * Skip invalidating modules on each request.
   * Useful for debugging or performance testing.
   * @default false
   */
  skipModuleInvalidation?: boolean;

  /**
   * Log requests to console.
   * @default true
   */
  logRequests?: boolean;

  /**
   * Paths that should skip SSR and pass through to next middleware.
   * Useful for API routes, static assets, etc.
   * @default ['/api/']
   */
  skipSSRPaths?: string[];

  /**
   * OpenAPI specification options.
   * When provided, serves the OpenAPI spec at GET /api/openapi.json
   */
  openapi?: OpenAPIOptions;
}

export interface DevServer {
  /**
   * Start the server and listen on the configured port.
   */
  listen(): Promise<void>;

  /**
   * Close the server.
   */
  close(): Promise<void>;

  /**
   * The underlying Vite dev server.
   */
  vite: ViteDevServer;

  /**
   * The underlying HTTP server.
   */
  httpServer: Server;
}

/**
 * Create a Vite SSR development server.
 */
export function createDevServer(options: DevServerOptions): DevServer {
  const {
    entry,
    port = 5173,
    host = '0.0.0.0',
    viteConfig = {},
    middleware,
    skipModuleInvalidation = false,
    logRequests = true,
    skipSSRPaths = ['/api/'],
    openapi,
  } = options;

  let vite: ViteDevServer;
  let httpServer: Server;
  
  // Cached OpenAPI spec - read once at startup and invalidate on file changes
  let cachedSpec: object | null = null;

  /**
   * Read and cache the OpenAPI spec file
   */
  const loadOpenAPISpec = (): object | null => {
    if (!openapi) return null;
    
    try {
      const specContent = readFileSync(openapi.specPath, 'utf-8');
      return JSON.parse(specContent);
    } catch (err) {
      console.error('[Server] Error reading OpenAPI spec:', err);
      return null;
    }
  };

  /**
   * Validate that the specPath file exists at startup
   * Log a warning if not (don't crash - the file might be generated later by the pipeline)
   */
  const validateSpecPath = (): void => {
    if (!openapi) return;
    
    if (!existsSync(openapi.specPath)) {
      console.warn(`[Server] Warning: OpenAPI spec file not found at ${openapi.specPath}. It will be generated when the pipeline runs.`);
    }
  };

  const listen = async () => {
    if (logRequests) {
      console.log('[Server] Starting Vite SSR dev server...');
    }

    // Validate specPath exists at startup
    validateSpecPath();

    // Initial load of OpenAPI spec
    if (openapi) {
      cachedSpec = loadOpenAPISpec();
      
      // Watch for changes to the spec file in dev mode
      if (cachedSpec !== null) {
        try {
          const specDir = openapi.specPath.substring(0, openapi.specPath.lastIndexOf('/'));
          const specFile = openapi.specPath.split('/').pop() || 'openapi.json';
          
          watch(specDir, { persistent: false }, (eventType, filename) => {
            if (filename === specFile && (eventType === 'change' || eventType === 'rename')) {
              if (logRequests) {
                console.log('[Server] OpenAPI spec file changed, reloading...');
              }
              cachedSpec = loadOpenAPISpec();
            }
          });
        } catch (err) {
          console.warn('[Server] Could not set up file watcher for OpenAPI spec:', err);
        }
      }
    }

    // Create Vite dev server in middleware mode
    try {
      vite = await createViteServer({
        ...viteConfig,
        plugins: [
          vertzSSRJsxPlugin(),
          ...(viteConfig.plugins ?? []),
        ],
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

    // Apply OpenAPI middleware if configured
    if (openapi) {
      vite.middlewares.use(async (req, res, next) => {
        const url = req.url || '/';

        // Only handle /api/openapi.json
        if (req.method === 'GET' && url === '/api/openapi.json') {
          // Use cached spec instead of reading from disk on every request
          if (cachedSpec) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(cachedSpec));
          } else if (!existsSync(openapi.specPath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('OpenAPI spec not found. Run the pipeline to generate it.');
          } else {
            // Try to reload if cache is null but file exists
            cachedSpec = loadOpenAPISpec();
            if (cachedSpec) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(cachedSpec));
            } else {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('Failed to load OpenAPI spec');
            }
          }
          return;
        }

        next();
      });
    }

    // SSR request handler
    vite.middlewares.use(async (req, res, next) => {
      const url = req.url || '/';

      try {
        // Skip Vite's internal routes
        if (url.startsWith('/@') || url.startsWith('/node_modules')) {
          return next();
        }

        // Skip configured paths (e.g., API routes)
        if (skipSSRPaths?.some((path) => url.startsWith(path))) {
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
        res.end((err as Error).stack || String(err));
      }
    });

    // Create HTTP server with Vite middleware
    httpServer = createHttpServer(vite.middlewares);

    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[Server] Port ${port} is already in use`);
      } else {
        console.error(`[Server] Server error:`, err);
      }
      process.exit(1);
    });

    await new Promise<void>((resolve) => {
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
      await new Promise<void>((resolve, reject) => {
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
