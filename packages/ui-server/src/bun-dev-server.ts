/**
 * Unified Bun development server: SSR + HMR in a single Bun.serve().
 *
 * SSR is always on. HMR always works. One mode, one behavior — dev matches
 * production. Bun's built-in HMR system handles client bundling; no manual
 * Bun.build() needed.
 *
 * Architecture:
 *   routes: { '/__vertz_hmr': hmrShell, '/api/*': apiHandler }
 *   fetch:  static files → nav pre-fetch → fetch interception → SSR render
 *   development: { hmr: true, console: true }
 *
 * A hidden `/__vertz_hmr` route initializes Bun's HMR system. After startup,
 * a self-fetch discovers the `/_bun/client/<hash>.js` URL and HMR bootstrap
 * snippet. SSR responses reference this URL for hydration + HMR.
 *
 * A file watcher on `src/` re-discovers the hash and re-imports the SSR module
 * on source changes, keeping SSR output fresh.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, watch, writeFileSync } from 'node:fs';
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
}

export interface BunDevServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface IndexHtmlStasher {
  stash(): void;
  restore(): void;
}

/**
 * Create a stasher that renames index.html during dev so Bun's built-in
 * HMR server doesn't auto-serve it, bypassing our SSR fetch handler.
 */
export function createIndexHtmlStasher(projectRoot: string): IndexHtmlStasher {
  const indexHtmlPath = resolve(projectRoot, 'index.html');
  const indexHtmlBackupPath = resolve(projectRoot, '.vertz', 'dev', 'index.html.bak');
  let stashed = false;

  return {
    stash() {
      if (existsSync(indexHtmlPath)) {
        mkdirSync(resolve(projectRoot, '.vertz', 'dev'), { recursive: true });
        renameSync(indexHtmlPath, indexHtmlBackupPath);
        stashed = true;
      }
    },
    restore() {
      if (stashed && existsSync(indexHtmlBackupPath)) {
        renameSync(indexHtmlBackupPath, indexHtmlPath);
        stashed = false;
      }
    },
  };
}

export interface HMRAssets {
  /** Discovered `/_bun/client/<hash>.js` URL, or null if not found */
  scriptUrl: string | null;
  /** HMR bootstrap `<script>` tag, or null if not found */
  bootstrapScript: string | null;
}

/**
 * Parse the HTML returned by the HMR shell route (`/__vertz_hmr`) to extract
 * the bundled client script URL and HMR bootstrap snippet.
 */
export function parseHMRAssets(html: string): HMRAssets {
  const srcMatch = html.match(/src="(\/_bun\/client\/[^"]+\.js)"/);
  const bootstrapMatch = html.match(/<script>(\(\(a\)=>\{document\.addEventListener.*?)<\/script>/);

  return {
    scriptUrl: srcMatch?.[1] ?? null,
    bootstrapScript: bootstrapMatch?.[1] ? `<script>${bootstrapMatch[1]}</script>` : null,
  };
}

export interface SSRPageHtmlOptions {
  title: string;
  css: string;
  bodyHtml: string;
  ssrData: unknown[];
  scriptTag: string;
}

/**
 * Generate a full SSR HTML page with the given content, CSS, SSR data, and script tag.
 */
export function generateSSRPageHtml({
  title,
  css,
  bodyHtml,
  ssrData,
  scriptTag,
}: SSRPageHtmlOptions): string {
  const ssrDataScript =
    ssrData.length > 0
      ? `<script>window.__VERTZ_SSR_DATA__=${safeSerialize(ssrData)};</script>`
      : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    ${css}
  </head>
  <body>
    <div id="app">${bodyHtml}</div>
    ${ssrDataScript}
    ${scriptTag}
  </body>
</html>`;
}

export interface FetchInterceptorOptions {
  apiHandler: (req: Request) => Promise<Response>;
  origin: string;
  skipSSRPaths: string[];
  originalFetch: typeof fetch;
}

/**
 * Create a fetch interceptor that routes local API requests through the
 * in-memory apiHandler instead of making HTTP self-fetch calls.
 * Matches production (Cloudflare) behavior where fetch('/api/...') during
 * SSR goes through the same handler.
 */
export function createFetchInterceptor({
  apiHandler,
  origin,
  skipSSRPaths,
  originalFetch,
}: FetchInterceptorOptions): typeof fetch {
  const intercepted: typeof fetch = (input, init) => {
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const isRelative = rawUrl.startsWith('/');
    const fetchPath = isRelative ? (rawUrl.split('?')[0] ?? '/') : new URL(rawUrl).pathname;
    const isLocal = isRelative || new URL(rawUrl).origin === origin;

    if (isLocal && skipSSRPaths.some((p) => fetchPath.startsWith(p))) {
      const absoluteUrl = isRelative ? `${origin}${rawUrl}` : rawUrl;
      const req = new Request(absoluteUrl, init);
      return apiHandler(req);
    }
    return originalFetch(input, init);
  };
  intercepted.preconnect = originalFetch.preconnect;
  return intercepted;
}

/**
 * Build the `<script>` tag for SSR HTML output.
 *
 * When `bundledScriptUrl` is available (HMR discovered), generates a tag with
 * `data-bun-dev-server-script` attribute required by Bun's HMR lifecycle.
 * Otherwise falls back to a plain module script pointing at the client source.
 */
export function buildScriptTag(
  bundledScriptUrl: string | null,
  hmrBootstrapScript: string | null,
  clientSrc: string,
): string {
  if (bundledScriptUrl) {
    const bootstrap = hmrBootstrapScript ? `\n    ${hmrBootstrapScript}` : '';
    return `<script type="module" crossorigin src="${bundledScriptUrl}" data-bun-dev-server-script></script>${bootstrap}`;
  }
  return `<script type="module" src="/${clientSrc}"></script>`;
}

/**
 * Create a unified Bun dev server with SSR + HMR.
 *
 * SSR is always on. HMR always works. No mode toggle needed.
 */
export function createBunDevServer(options: BunDevServerOptions): BunDevServer {
  const {
    entry,
    port = 3000,
    host = 'localhost',
    apiHandler,
    skipSSRPaths = ['/api/'],
    openapi,
    clientEntry: clientEntryOption,
    title = 'Vertz App',
    projectRoot = process.cwd(),
    logRequests = true,
  } = options;

  let server: ReturnType<typeof Bun.serve> | null = null;
  let srcWatcherRef: ReturnType<typeof watch> | null = null;

  // Bun's dev server auto-serves index.html from the project root when
  // development.hmr is true, bypassing the fetch() handler entirely.
  // We stash it during dev so all requests go through our SSR fetch handler.
  const indexHtmlStasher = createIndexHtmlStasher(projectRoot);

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

  // ── Unified SSR + HMR ────────────────────────────────────────────

  async function start(): Promise<void> {
    // Stash index.html so Bun's dev server doesn't auto-serve it
    indexHtmlStasher.stash();

    const { plugin } = await import('bun');
    const { createVertzBunPlugin } = await import('./bun-plugin');

    const entryPath = resolve(projectRoot, entry);
    const clientSrc = clientEntryOption ?? entry;

    // Register JSX runtime swap for SSR (server-side imports)
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

    // Register the Vertz compiler plugin for SSR transforms (no HMR on server side)
    const { plugin: serverPlugin } = createVertzBunPlugin({
      hmr: false,
      fastRefresh: false,
    });
    plugin(serverPlugin);

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

    // Generate HMR shell HTML at .vertz/dev/hmr-shell.html
    // This page initializes Bun's HMR system by importing the client entry
    const devDir = resolve(projectRoot, '.vertz', 'dev');
    mkdirSync(devDir, { recursive: true });

    // Fast Refresh runtime: resolve from generated HTML at .vertz/dev/
    // back to project root's node_modules
    const frRuntimePath =
      '../../node_modules/@vertz/ui-server/dist/bun-plugin/fast-refresh-runtime.js';

    const hmrShellHtml = `<!doctype html>
<html lang="en"><head>
  <meta charset="UTF-8" />
  <title>HMR Shell</title>
</head><body>
  <script type="module" src="${frRuntimePath}"></script>
  <script type="module" src="${clientSrc}"></script>
</body></html>`;

    const hmrShellPath = resolve(devDir, 'hmr-shell.html');
    writeFileSync(hmrShellPath, hmrShellHtml);

    const hmrShellModule = require(hmrShellPath);

    setupOpenAPIWatcher();

    // Discovered HMR assets (populated after self-fetch)
    let bundledScriptUrl: string | null = null;
    let hmrBootstrapScript: string | null = null;

    // Build routes object conditionally (Bun doesn't accept undefined route values).
    // biome-ignore lint/suspicious/noExplicitAny: Bun routes are dynamically composed from user config
    const routes: Record<string, any> = {
      '/__vertz_hmr': hmrShellModule,
    };

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

      async fetch(request) {
        const url = new URL(request.url);
        const pathname = url.pathname;

        // OpenAPI spec (fallback for non-route match)
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

        // SSR render with fetch interception
        if (logRequests) {
          console.log(`[Server] SSR: ${pathname}`);
        }

        try {
          // Patch globalThis.fetch during SSR so API requests (e.g. query()
          // calling fetch('/api/todos')) route through the in-memory apiHandler
          // instead of HTTP self-fetch. Matches production (Cloudflare) behavior.
          const originalFetch = globalThis.fetch;
          if (apiHandler) {
            globalThis.fetch = createFetchInterceptor({
              apiHandler,
              origin: `http://${host}:${server?.port}`,
              skipSSRPaths,
              originalFetch,
            });
          }

          try {
            const result = await ssrRenderToString(ssrMod, pathname, { ssrTimeout: 300 });
            const scriptTag = buildScriptTag(bundledScriptUrl, hmrBootstrapScript, clientSrc);
            const html = generateSSRPageHtml({
              title,
              css: result.css,
              bodyHtml: result.html,
              ssrData: result.ssrData,
              scriptTag,
            });

            return new Response(html, {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
          } finally {
            if (apiHandler) {
              globalThis.fetch = originalFetch;
            }
          }
        } catch (err) {
          console.error('[Server] SSR error:', err);
          const scriptTag = buildScriptTag(bundledScriptUrl, hmrBootstrapScript, clientSrc);
          const fallbackHtml = generateSSRPageHtml({
            title,
            css: '',
            bodyHtml: '',
            ssrData: [],
            scriptTag,
          });

          return new Response(fallbackHtml, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
      },

      development: {
        hmr: true,
        console: true,
      },
    });

    if (logRequests) {
      console.log(`[Server] SSR+HMR dev server running at http://${host}:${server.port}`);
    }

    // Self-fetch /__vertz_hmr to discover the bundled script URL and HMR bootstrap
    await discoverHMRAssets();

    async function discoverHMRAssets(): Promise<void> {
      try {
        const res = await fetch(`http://${host}:${server?.port}/__vertz_hmr`);
        const html = await res.text();
        const assets = parseHMRAssets(html);

        if (assets.scriptUrl) {
          bundledScriptUrl = assets.scriptUrl;
          if (logRequests) {
            console.log('[Server] Discovered bundled script URL:', bundledScriptUrl);
          }
        }

        if (assets.bootstrapScript) {
          hmrBootstrapScript = assets.bootstrapScript;
          if (logRequests) {
            console.log('[Server] Extracted HMR bootstrap script');
          }
        }
      } catch (e) {
        console.warn('[Server] Could not discover HMR bundled URL:', e);
      }
    }

    // Watch for file changes — re-discover hash + re-import SSR module
    const srcDir = resolve(projectRoot, 'src');
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

    if (existsSync(srcDir)) {
      srcWatcherRef = watch(srcDir, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        if (refreshTimeout) clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(async () => {
          if (logRequests) {
            console.log(`[Server] File changed: ${filename}`);
          }

          // Re-discover HMR assets (hash changes on every edit)
          await discoverHMRAssets();

          // Re-import SSR module with cache busting
          try {
            const freshMod: SSRModule = await import(`${entryPath}?t=${Date.now()}`);
            ssrMod = freshMod;
            if (logRequests) {
              console.log('[Server] SSR module refreshed');
            }
          } catch (e) {
            console.error('[Server] Failed to refresh SSR module:', e);
            // Keep using the old module — last known good
          }
        }, 100);
      });
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
    start,

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

      // Restore index.html if we stashed it
      indexHtmlStasher.restore();
    },
  };
}
