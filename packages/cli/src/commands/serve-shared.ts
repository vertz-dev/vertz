/**
 * Shared Serving Functions
 *
 * Pure serving functions used by both `vertz start` and `vertz preview`.
 * These functions return server instances without side effects
 * (no signal handlers, no console logging, no process.exit).
 */

import { createServer, type Server } from 'node:http';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { err, ok, type Result } from '@vertz/errors';
import type { AppType } from '../dev-server/app-detector';

/** Simple MIME type lookup for static file serving. */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
};

function getMimeType(filePath: string): string {
  return MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';
}

export interface ServeOptions {
  projectRoot: string;
  port: number;
  host: string;
  verbose: boolean;
}

export interface ServeResult {
  server: { port: number; stop(): void };
  url: string;
  aotRouteCount: number;
}

/**
 * Discover the SSR module entry in dist/server/.
 * Prefers app.js, falls back to the first .js file found.
 */
export function discoverSSRModule(projectRoot: string): string | undefined {
  const serverDir = join(projectRoot, 'dist', 'server');
  if (!existsSync(serverDir)) return undefined;

  const files = readdirSync(serverDir).filter((f) => f.endsWith('.js'));
  if (files.length === 0) return undefined;

  // Prefer app.js
  if (files.includes('app.js')) {
    return join(serverDir, 'app.js');
  }

  const first = files[0];
  return first ? join(serverDir, first) : undefined;
}

/**
 * Validate that required build outputs exist for the given app type.
 */
export function validateBuildOutputs(projectRoot: string, appType: AppType): Result<void, Error> {
  const missing: string[] = [];

  if (appType === 'api-only' || appType === 'full-stack') {
    const apiBuild = join(projectRoot, '.vertz', 'build', 'index.js');
    if (!existsSync(apiBuild)) {
      missing.push('.vertz/build/index.js');
    }
  }

  if (appType === 'ui-only' || appType === 'full-stack') {
    // Check for _shell.html (new) or index.html (legacy) as SSR template
    const shellHtml = join(projectRoot, 'dist', 'client', '_shell.html');
    const clientHtml = join(projectRoot, 'dist', 'client', 'index.html');
    if (!existsSync(shellHtml) && !existsSync(clientHtml)) {
      missing.push('dist/client/_shell.html');
    }

    const ssrModule = discoverSSRModule(projectRoot);
    if (!ssrModule) {
      missing.push('dist/server/ (no SSR module found)');
    }
  }

  if (missing.length > 0) {
    return err(
      new Error(
        `Missing build outputs:\n  - ${missing.join('\n  - ')}\n\nRun "vertz build" first.`,
      ),
    );
  }

  return ok(undefined);
}

/**
 * Discover CSS files to inline from the client build.
 */
export function discoverInlineCSS(projectRoot: string): Record<string, string> | undefined {
  const cssDir = resolve(projectRoot, 'dist', 'client', 'assets');
  if (!existsSync(cssDir)) return undefined;

  const cssFiles = readdirSync(cssDir).filter((f) => f.endsWith('.css'));
  if (cssFiles.length === 0) return undefined;

  const result: Record<string, string> = {};
  for (const file of cssFiles) {
    const content = readFileSync(join(cssDir, file), 'utf-8');
    result[`/assets/${file}`] = content;
  }
  return result;
}

/**
 * Serve pre-rendered HTML for a route.
 * Checks for dist/client/<pathname>/index.html or dist/client/index.html for /.
 * Returns null if no pre-rendered file exists.
 */
export function servePrerenderHTML(clientDir: string, pathname: string): Response | null {
  const htmlPath =
    pathname === '/'
      ? resolve(clientDir, 'index.html')
      : resolve(clientDir, `${pathname.replace(/^\//, '')}/index.html`);

  // Path traversal guard
  if (!htmlPath.startsWith(clientDir)) return null;

  // Skip _shell.html — that's the SSR template, not a pre-rendered page
  if (htmlPath.endsWith('/_shell.html')) return null;

  if (!existsSync(htmlPath) || !statSync(htmlPath).isFile()) return null;
  const fileSize = statSync(htmlPath).size;
  if (!fileSize) return null;

  return new Response(readFileSync(htmlPath), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}

/**
 * Serve a static file from the client directory.
 * Returns null if the file doesn't exist or the path is outside the directory.
 */
export function serveStaticFile(clientDir: string, pathname: string): Response | null {
  // Skip root and html requests — let SSR handle those
  if (pathname === '/' || pathname === '/index.html') return null;

  const filePath = resolve(clientDir, `.${pathname}`);

  // Path traversal guard
  if (!filePath.startsWith(clientDir)) return null;

  // Guard: skip directories and non-existent files
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return null;

  const fileSize = statSync(filePath).size;
  if (!fileSize) return null;

  // Cache headers
  const isHashedAsset = pathname.startsWith('/assets/');
  const cacheControl = isHashedAsset
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600';

  return new Response(readFileSync(filePath), {
    headers: {
      'Cache-Control': cacheControl,
      'Content-Type': getMimeType(filePath),
    },
  });
}

/**
 * Create an HTTP server from a web-standard fetch handler.
 * Converts between node:http IncomingMessage/ServerResponse and Request/Response.
 */
function startWebServer(
  port: number,
  hostname: string,
  handler: (req: Request) => Response | Promise<Response>,
): Promise<{ port: number; stop(): void }> {
  return new Promise((resolvePromise) => {
    const server: Server = createServer(async (nodeReq, nodeRes) => {
      try {
        const url = `http://${hostname}:${port}${nodeReq.url ?? '/'}`;
        const headers = new Headers();
        for (const [key, value] of Object.entries(nodeReq.headers)) {
          if (value) {
            if (Array.isArray(value)) {
              for (const v of value) headers.append(key, v);
            } else {
              headers.set(key, value);
            }
          }
        }

        const method = nodeReq.method ?? 'GET';
        const hasBody = method !== 'GET' && method !== 'HEAD';
        let bodyArrayBuffer: ArrayBuffer | undefined;
        if (hasBody) {
          const chunks: Buffer[] = [];
          for await (const chunk of nodeReq) {
            chunks.push(chunk as Buffer);
          }
          const buf = Buffer.concat(chunks);
          bodyArrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        }

        const request = new Request(url, {
          method,
          headers,
          body: hasBody ? bodyArrayBuffer : undefined,
        });

        const response = await handler(request);

        nodeRes.writeHead(response.status, Object.fromEntries(response.headers));
        const respBody = await response.arrayBuffer();
        nodeRes.end(Buffer.from(respBody));
      } catch (error) {
        nodeRes.writeHead(500, { 'Content-Type': 'text/plain' });
        nodeRes.end(error instanceof Error ? error.message : 'Internal Server Error');
      }
    });

    server.listen(port, hostname, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;

      resolvePromise({
        port: actualPort,
        stop() {
          server.close();
        },
      });
    });
  });
}

/**
 * Serve a UI-only app. Returns server instance — caller handles logging and signals.
 */
export async function serveUIOnly(options: ServeOptions): Promise<Result<ServeResult, Error>> {
  const { projectRoot, port, host } = options;

  const ssrModulePath = discoverSSRModule(projectRoot);
  if (!ssrModulePath) {
    return err(new Error('No SSR module found in dist/server/. Run "vertz build" first.'));
  }

  // Prefer _shell.html (new), fall back to index.html (legacy)
  const shellPath = resolve(projectRoot, 'dist', 'client', '_shell.html');
  const legacyPath = resolve(projectRoot, 'dist', 'client', 'index.html');
  const templatePath = existsSync(shellPath) ? shellPath : legacyPath;
  const template = readFileSync(templatePath, 'utf-8');

  let ssrModule: import('@vertz/ui-server/ssr').SSRModule;
  try {
    ssrModule = await import(ssrModulePath);
  } catch (error) {
    return err(
      new Error(
        `Failed to import SSR module: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  // Inline CSS to prevent FOUC
  const inlineCSS = discoverInlineCSS(projectRoot);

  const { createSSRHandler, loadAotManifest } = await import('@vertz/ui-server/ssr');

  // Load AOT manifest if available (optional — graceful degradation)
  const serverDir = join(projectRoot, 'dist', 'server');
  const aotManifest = await loadAotManifest(serverDir).catch(() => null);
  const aotRouteCount = aotManifest ? Object.keys(aotManifest.routes).length : 0;

  const ssrHandler = createSSRHandler({
    module: ssrModule,
    template,
    inlineCSS,
    aotManifest: aotManifest ?? undefined,
  });

  const clientDir = resolve(projectRoot, 'dist', 'client');

  const server = await startWebServer(port, host, async (req) => {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Nav pre-fetch always goes through SSR (for query discovery)
    if (req.headers.get('x-vertz-nav') === '1') {
      return ssrHandler(req);
    }

    // Serve static assets (JS, CSS, images)
    const staticResponse = serveStaticFile(clientDir, pathname);
    if (staticResponse) return staticResponse;

    // Check for pre-rendered HTML
    const prerenderResponse = servePrerenderHTML(clientDir, pathname);
    if (prerenderResponse) return prerenderResponse;

    // Fallback: runtime SSR
    return ssrHandler(req);
  });

  const displayHost = host === '0.0.0.0' ? 'localhost' : host;
  return ok({ server, url: `http://${displayHost}:${server.port}`, aotRouteCount });
}

/**
 * Serve an API-only app. Returns server instance — caller handles logging and signals.
 */
export async function serveApiOnly(options: ServeOptions): Promise<Result<ServeResult, Error>> {
  const { projectRoot, port, host } = options;

  const entryPath = resolve(projectRoot, '.vertz', 'build', 'index.js');

  let mod: { default?: { handler?: (req: Request) => Response | Promise<Response> } };
  try {
    mod = await import(entryPath);
  } catch (error) {
    return err(
      new Error(
        `Failed to import API module: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  const handler = mod.default?.handler;
  if (typeof handler !== 'function') {
    return err(new Error('API module must export default with a .handler function.'));
  }

  const server = await startWebServer(port, host, handler);

  const displayHost = host === '0.0.0.0' ? 'localhost' : host;
  return ok({ server, url: `http://${displayHost}:${server.port}`, aotRouteCount: 0 });
}

/**
 * Serve a full-stack app (API + SSR + static files).
 * Returns server instance — caller handles logging and signals.
 */
export async function serveFullStack(options: ServeOptions): Promise<Result<ServeResult, Error>> {
  const { projectRoot, port, host } = options;

  // Load API handler
  const apiEntryPath = resolve(projectRoot, '.vertz', 'build', 'index.js');
  let apiMod: { default?: { handler?: (req: Request) => Response | Promise<Response> } };
  try {
    apiMod = await import(apiEntryPath);
  } catch (error) {
    return err(
      new Error(
        `Failed to import API module: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  const apiHandler = apiMod.default?.handler;
  if (typeof apiHandler !== 'function') {
    return err(new Error('API module must export default with a .handler function.'));
  }

  // Load SSR module
  const ssrModulePath = discoverSSRModule(projectRoot);
  if (!ssrModulePath) {
    return err(new Error('No SSR module found in dist/server/. Run "vertz build" first.'));
  }

  // Prefer _shell.html (new), fall back to index.html (legacy)
  const shellPath = resolve(projectRoot, 'dist', 'client', '_shell.html');
  const legacyPath = resolve(projectRoot, 'dist', 'client', 'index.html');
  const templatePath = existsSync(shellPath) ? shellPath : legacyPath;
  const template = readFileSync(templatePath, 'utf-8');

  let ssrModule: import('@vertz/ui-server/ssr').SSRModule;
  try {
    ssrModule = await import(ssrModulePath);
  } catch (error) {
    return err(
      new Error(
        `Failed to import SSR module: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  const inlineCSS = discoverInlineCSS(projectRoot);

  const { createSSRHandler, loadAotManifest } = await import('@vertz/ui-server/ssr');

  // Load AOT manifest if available (optional — graceful degradation)
  const serverDir = join(projectRoot, 'dist', 'server');
  const aotManifest = await loadAotManifest(serverDir).catch(() => null);
  const aotRouteCount = aotManifest ? Object.keys(aotManifest.routes).length : 0;

  const ssrHandler = createSSRHandler({
    module: ssrModule,
    template,
    inlineCSS,
    aotManifest: aotManifest ?? undefined,
  });

  const clientDir = resolve(projectRoot, 'dist', 'client');

  const server = await startWebServer(port, host, async (req) => {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // API routes
    if (pathname.startsWith('/api')) {
      return apiHandler(req);
    }

    // Nav pre-fetch always goes through SSR (for query discovery)
    if (req.headers.get('x-vertz-nav') === '1') {
      return ssrHandler(req);
    }

    // Static assets
    const staticResponse = serveStaticFile(clientDir, pathname);
    if (staticResponse) return staticResponse;

    // Pre-rendered HTML
    const prerenderResponse = servePrerenderHTML(clientDir, pathname);
    if (prerenderResponse) return prerenderResponse;

    // Runtime SSR fallback
    return ssrHandler(req);
  });

  const displayHost = host === '0.0.0.0' ? 'localhost' : host;
  return ok({ server, url: `http://${displayHost}:${server.port}`, aotRouteCount });
}

/**
 * Set up graceful shutdown on SIGINT, SIGTERM, SIGHUP.
 * Stops the server and lets the event loop drain naturally.
 */
export function setupGracefulShutdown(server: { stop(): void }): void {
  const shutdown = () => {
    console.log('\nShutting down...');
    server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);
}
