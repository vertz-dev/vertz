/**
 * Dual-mode Bun development server.
 *
 * Two mutually exclusive modes:
 *
 * **HMR mode** (default): Bun.serve() + HTML import + routes.
 * Fast Refresh + CSS sidecar HMR. No SSR — client renders everything.
 * API routes via route-level handler functions.
 *
 * **SSR mode**: Bun.serve() + fetch() handler.
 * SSR on every request + nav prefetch. Full page reload on changes (~400ms).
 * Module freshness via `bun --watch` (restarts the entire process).
 */

import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { SSRModule } from './ssr-render';
import { ssrDiscoverQueries, ssrRenderToString } from './ssr-render';
import { safeSerialize } from './ssr-streaming-runtime';

export interface BunDevServerOptions {
  /** SSR entry module (e.g., './src/app.tsx') */
  entry: string;
  /** Port to listen on. @default 3000 */
  port?: number;
  /** Host to bind to. @default 'localhost' */
  host?: string;
  /** API handler for full-stack mode */
  apiHandler?: (req: Request) => Promise<Response>;
  /** Paths to skip SSR (delegate to apiHandler). @default ['/api/'] */
  skipSSRPaths?: string[];
  /** OpenAPI spec options */
  openapi?: { specPath: string };
  /** When true, entry is SSRModule (exports App/theme/styles). @default false */
  ssrModule?: boolean;
  /** Client entry path (for hydration). */
  clientEntry?: string;
  /** HTML page title. @default 'Vertz App' */
  title?: string;
  /** Project root. @default process.cwd() */
  projectRoot?: string;
  /** Log requests. @default true */
  logRequests?: boolean;
  /** Enable SSR mode. When false, uses HMR mode. @default false */
  ssr?: boolean;
}

export interface BunDevServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Create a Bun-native dev server with two modes: HMR (default) and SSR.
 */
export function createBunDevServer(options: BunDevServerOptions): BunDevServer {
  const {
    entry,
    port = 3000,
    host = 'localhost',
    apiHandler,
    skipSSRPaths = ['/api/'],
    openapi,
    ssrModule: useSSRModule = false,
    clientEntry: clientEntryOption,
    title = 'Vertz App',
    projectRoot = process.cwd(),
    logRequests = true,
    ssr = false,
  } = options;

  let server: ReturnType<typeof Bun.serve> | null = null;
  let srcWatcherRef: ReturnType<typeof watch> | null = null;

  // OpenAPI spec caching
  let cachedSpec: object | null = null;
  let specWatcher: ReturnType<typeof watch> | null = null;

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

  const setupOpenAPIWatcher = (): void => {
    if (!openapi || !existsSync(openapi.specPath)) return;

    cachedSpec = loadOpenAPISpec();
    if (cachedSpec === null) return;

    try {
      const specDir = dirname(openapi.specPath);
      const specFile = openapi.specPath.split('/').pop() || 'openapi.json';

      specWatcher = watch(specDir, { persistent: false }, (eventType, filename) => {
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
  };

  const serveOpenAPISpec = (): Response => {
    if (cachedSpec) {
      return new Response(JSON.stringify(cachedSpec), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (openapi && existsSync(openapi.specPath)) {
      cachedSpec = loadOpenAPISpec();
      if (cachedSpec) {
        return new Response(JSON.stringify(cachedSpec), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('OpenAPI spec not found', { status: 404 });
  };

  // ── HMR Mode ────────────────────────────────────────────────────

  async function startHMR(): Promise<void> {
    // Determine HTML entry path
    let htmlEntryPath: string;
    const indexHtmlPath = resolve(projectRoot, 'index.html');

    if (existsSync(indexHtmlPath)) {
      htmlEntryPath = indexHtmlPath;
    } else if (useSSRModule) {
      // Generate a dev HTML shell for ssrModule mode
      const devDir = resolve(projectRoot, '.vertz', 'dev');
      mkdirSync(devDir, { recursive: true });

      const clientSrc = clientEntryOption ?? entry;

      // Fast Refresh runtime: resolve from generated HTML at .vertz/dev/index.html
      // back to project root's node_modules
      const frRuntimePath =
        '../../node_modules/@vertz/ui-server/dist/bun-plugin/fast-refresh-runtime.js';

      const html = `<!doctype html>
<html lang="en"><head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head><body>
  <div id="app"></div>
  <script type="module" src="${frRuntimePath}"></script>
  <script type="module" src="${clientSrc}"></script>
</body></html>`;

      htmlEntryPath = resolve(devDir, 'index.html');
      writeFileSync(htmlEntryPath, html);
    } else {
      throw new Error(
        'HMR mode requires an index.html in the project root, or ssrModule: true to auto-generate one.',
      );
    }

    const homepage = require(htmlEntryPath);

    setupOpenAPIWatcher();

    // Build routes object conditionally (Bun doesn't accept undefined route values).
    // Use a plain object and cast to satisfy Bun's mapped route types.
    // biome-ignore lint/suspicious/noExplicitAny: Bun routes are dynamically composed from user config
    const routes: Record<string, any> = { '/*': homepage };

    if (openapi) {
      routes['/api/openapi.json'] = () => serveOpenAPISpec();
    }

    if (apiHandler) {
      routes['/api/*'] = (req: Request) => apiHandler(req);
    }

    server = Bun.serve({
      port,
      hostname: host,
      routes,
      development: {
        hmr: true,
        console: true,
      },
    });

    if (logRequests) {
      console.log(`[Server] HMR dev server running at http://${host}:${server.port}`);
    }
  }

  // ── SSR Mode ────────────────────────────────────────────────────

  async function startSSR(): Promise<void> {
    const { plugin } = await import('bun');
    const { createVertzBunPlugin } = await import('./bun-plugin');

    const entryPath = resolve(projectRoot, entry);

    // Register JSX runtime swap for SSR
    plugin({
      name: 'vertz-ssr-jsx-swap',
      setup(build) {
        build.onResolve({ filter: /^@vertz\/ui\/jsx-runtime$/ }, () => ({
          path: '@vertz/ui-server/jsx-runtime',
          external: false,
        }));
        build.onResolve({ filter: /^@vertz\/ui\/jsx-dev-runtime$/ }, () => ({
          path: '@vertz/ui-server/jsx-runtime',
          external: false,
        }));
      },
    });

    // Register the Vertz compiler plugin for SSR transforms
    const { plugin: serverPlugin } = createVertzBunPlugin({
      hmr: false,
      fastRefresh: false,
    });
    plugin(serverPlugin);

    // Build the client bundle
    let clientBundle = '';

    const { plugin: clientPlugin } = createVertzBunPlugin({
      hmr: false,
      fastRefresh: false,
    });

    async function buildClient(): Promise<boolean> {
      const start = performance.now();
      const result = await Bun.build({
        entrypoints: [entryPath],
        plugins: [clientPlugin],
        target: 'browser',
        minify: false,
        sourcemap: 'inline',
      });

      if (!result.success) {
        console.error('Client build failed:');
        for (const log of result.logs) {
          console.error(' ', log.message);
        }
        return false;
      }

      for (const output of result.outputs) {
        clientBundle = await output.text();
      }

      const elapsed = performance.now() - start;
      if (logRequests) {
        console.log(`[Server] Client built in ${elapsed.toFixed(0)}ms`);
      }
      return true;
    }

    if (logRequests) {
      console.log('[Server] Building client bundle...');
    }

    const clientOk = await buildClient();
    if (!clientOk) {
      console.error('[Server] Client build failed. Fix errors and restart.');
      process.exit(1);
    }

    // Read HTML template
    let indexHtml: string;
    const indexHtmlPath = resolve(projectRoot, 'index.html');
    if (existsSync(indexHtmlPath)) {
      indexHtml = await Bun.file(indexHtmlPath).text();
    } else if (useSSRModule) {
      // Generate a minimal template for SSR module mode
      const clientSrc = clientEntryOption ?? entry;
      indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="${clientSrc}"></script>
  </body>
</html>`;
    } else {
      throw new Error(
        'SSR mode requires an index.html in the project root, or ssrModule: true to auto-generate one.',
      );
    }

    // Load SSR module
    let ssrMod: SSRModule;
    try {
      ssrMod = await import(entryPath);
      if (logRequests) {
        console.log('[Server] SSR module loaded');
      }
    } catch (e) {
      console.error('[Server] Failed to load SSR module:', e);
      process.exit(1);
    }

    /**
     * Inject SSR output into the HTML template.
     */
    function injectIntoTemplate(
      template: string,
      appHtml: string,
      appCss: string,
      ssrData: Array<{ key: string; data: unknown }>,
    ): string {
      // Replace script src with inline client bundle
      let html = template.replace(
        /<script type="module" src="[^"]+"><\/script>/,
        `<script type="module">\n${clientBundle}\n</script>`,
      );

      // Inject app HTML into <div id="app"> or <!--ssr-outlet-->
      if (html.includes('<!--ssr-outlet-->')) {
        html = html.replace('<!--ssr-outlet-->', appHtml);
      } else {
        html = html.replace(/(<div[^>]*id="app"[^>]*>)([\s\S]*?)(<\/div>)/, `$1${appHtml}$3`);
      }

      // Inject CSS before </head>
      if (appCss) {
        html = html.replace('</head>', `${appCss}\n</head>`);
      }

      // Inject SSR data for client-side hydration before </body>
      if (ssrData.length > 0) {
        const ssrDataScript = `<script>window.__VERTZ_SSR_DATA__=${safeSerialize(ssrData)};</script>`;
        html = html.replace('</body>', `${ssrDataScript}\n</body>`);
      }

      return html;
    }

    // Client-only fallback HTML
    const clientOnlyHtml = indexHtml.replace(
      /<script type="module" src="[^"]+"><\/script>/,
      `<script type="module">\n${clientBundle}\n</script>`,
    );

    setupOpenAPIWatcher();

    // Watch for file changes and rebuild client bundle
    const srcDir = resolve(projectRoot, 'src');
    let rebuildTimeout: ReturnType<typeof setTimeout> | null = null;

    if (existsSync(srcDir)) {
      srcWatcherRef = watch(srcDir, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        if (rebuildTimeout) clearTimeout(rebuildTimeout);
        rebuildTimeout = setTimeout(async () => {
          if (logRequests) {
            console.log(`[Server] File changed: ${filename}`);
          }
          await buildClient();
        }, 100);
      });
    }

    // Start server
    server = Bun.serve({
      port,
      hostname: host,

      async fetch(request) {
        const url = new URL(request.url);
        const pathname = url.pathname;

        // OpenAPI spec
        if (openapi && request.method === 'GET' && pathname === '/api/openapi.json') {
          return serveOpenAPISpec();
        }

        // API routes — delegate to apiHandler
        if (apiHandler && skipSSRPaths.some((p) => pathname.startsWith(p))) {
          return apiHandler(request);
        }

        // Nav pre-fetch (X-Vertz-Nav: 1)
        if (request.headers.get('x-vertz-nav') === '1') {
          try {
            const result = await ssrDiscoverQueries(ssrMod, pathname, { ssrTimeout: 300 });
            let body = '';
            for (const qEntry of result.resolved) {
              body += `event: data\ndata: ${safeSerialize(qEntry)}\n\n`;
            }
            body += 'event: done\ndata: {}\n\n';
            return new Response(body, {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
              },
            });
          } catch {
            return new Response('event: done\ndata: {}\n\n', {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
              },
            });
          }
        }

        // Serve static files from public/
        if (pathname !== '/' && !pathname.endsWith('.html')) {
          const publicFile = Bun.file(resolve(projectRoot, `public${pathname}`));
          if (await publicFile.exists()) {
            return new Response(publicFile);
          }
          const rootFile = Bun.file(resolve(projectRoot, pathname.slice(1)));
          if (await rootFile.exists()) {
            return new Response(rootFile);
          }
        }

        // Skip non-HTML requests
        if (
          !request.headers.get('accept')?.includes('text/html') &&
          !pathname.endsWith('.html') &&
          pathname !== '/'
        ) {
          return new Response('Not Found', { status: 404 });
        }

        // SSR render
        if (logRequests) {
          console.log(`[Server] SSR: ${pathname}`);
        }

        try {
          const result = await ssrRenderToString(ssrMod, pathname, { ssrTimeout: 300 });
          const html = injectIntoTemplate(indexHtml, result.html, result.css, result.ssrData);

          return new Response(html, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        } catch (err) {
          console.error('[Server] SSR error:', err);
          // Graceful fallback: serve client-only HTML
          return new Response(clientOnlyHtml, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
      },
    });

    if (logRequests) {
      console.log(`[Server] SSR dev server running at http://${host}:${server.port}`);
    }

    // srcWatcherRef is set above and cleaned up in stop()
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
    async start() {
      if (ssr) {
        await startSSR();
      } else {
        await startHMR();
      }
    },

    async stop() {
      if (specWatcher) {
        specWatcher.close();
        specWatcher = null;
      }

      if (srcWatcherRef) {
        srcWatcherRef.close();
        srcWatcherRef = null;
      }

      if (server) {
        server.stop(true);
        server = null;
      }
    },
  };
}
