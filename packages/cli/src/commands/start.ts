/**
 * Vertz Start Command - Production Server
 *
 * Starts the production server after `vertz build`.
 * Dispatches to the correct server mode based on app type:
 * - API-only:   Import built module, use its handler
 * - UI-only:    SSR + static file serving
 * - Full-stack: API handler + SSR + static file serving
 */

// Minimal ambient declaration for Bun APIs used by this module.
// The CLI runs under Bun at runtime; these declarations let tsc validate
// without pulling in bun-types (which conflicts with @types/node).
declare const Bun: {
  serve(options: {
    port: number;
    hostname: string;
    fetch: (req: Request) => Response | Promise<Response>;
  }): { port: number; stop(): void };
  file(path: string): Blob & { size: number; type: string };
};

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { err, ok, type Result } from '@vertz/errors';
import type { AppType } from '../dev-server/app-detector';
import { detectAppType } from '../dev-server/app-detector';
import { findProjectRoot } from '../utils/paths';

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

export interface StartCommandOptions {
  port?: number;
  host?: string;
  verbose?: boolean;
}

/**
 * Start the production server.
 */
export async function startAction(options: StartCommandOptions = {}): Promise<Result<void, Error>> {
  const { port = Number(process.env.PORT) || 3000, host = '0.0.0.0', verbose = false } = options;

  // Find project root
  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) {
    return err(new Error('Could not find project root. Are you in a Vertz project?'));
  }

  // Detect app type
  let detected: ReturnType<typeof detectAppType>;
  try {
    detected = detectAppType(projectRoot);
  } catch (error) {
    return err(new Error(error instanceof Error ? error.message : String(error)));
  }

  if (verbose) {
    console.log(`Detected app type: ${detected.type}`);
  }

  // Validate build outputs
  const validation = validateBuildOutputs(projectRoot, detected.type);
  if (!validation.ok) {
    return validation;
  }

  // Start server based on app type
  switch (detected.type) {
    case 'api-only':
      return startApiOnly(projectRoot, port, host, verbose);
    case 'ui-only':
      return startUIOnly(projectRoot, port, host, verbose);
    case 'full-stack':
      return startFullStack(projectRoot, port, host, verbose);
  }
}

/**
 * Start an API-only production server.
 */
async function startApiOnly(
  projectRoot: string,
  port: number,
  host: string,
  _verbose: boolean,
): Promise<Result<void, Error>> {
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

  const server = Bun.serve({
    port,
    hostname: host,
    fetch: handler,
  });

  console.log(
    `Vertz API server running at http://${host === '0.0.0.0' ? 'localhost' : host}:${server.port}`,
  );

  setupGracefulShutdown(server);
  return ok(undefined);
}

/**
 * Start a UI-only production server with SSR + static files.
 */
async function startUIOnly(
  projectRoot: string,
  port: number,
  host: string,
  _verbose: boolean,
): Promise<Result<void, Error>> {
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

  const { createSSRHandler } = await import('@vertz/ui-server/ssr');
  const ssrHandler = createSSRHandler({
    module: ssrModule,
    template,
    inlineCSS,
  });

  const clientDir = resolve(projectRoot, 'dist', 'client');

  const server = Bun.serve({
    port,
    hostname: host,
    async fetch(req) {
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
    },
  });

  console.log(
    `Vertz server running at http://${host === '0.0.0.0' ? 'localhost' : host}:${server.port}`,
  );

  setupGracefulShutdown(server);
  return ok(undefined);
}

/**
 * Start a full-stack production server with API + SSR + static files.
 */
async function startFullStack(
  projectRoot: string,
  port: number,
  host: string,
  _verbose: boolean,
): Promise<Result<void, Error>> {
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

  const { createSSRHandler } = await import('@vertz/ui-server/ssr');
  const ssrHandler = createSSRHandler({
    module: ssrModule,
    template,
    inlineCSS,
  });

  const clientDir = resolve(projectRoot, 'dist', 'client');

  const server = Bun.serve({
    port,
    hostname: host,
    async fetch(req) {
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
    },
  });

  console.log(
    `Vertz full-stack server running at http://${host === '0.0.0.0' ? 'localhost' : host}:${server.port}`,
  );

  setupGracefulShutdown(server);
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

  const file = Bun.file(htmlPath);
  if (!file.size) return null;

  return new Response(file, {
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

  // Guard: skip directories (Bun.file on a directory causes "MacOS does not
  // support sending non-regular files" when used as a Response body).
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return null;

  const file = Bun.file(filePath);
  if (!file.size) return null;

  // Cache headers
  const isHashedAsset = pathname.startsWith('/assets/');
  const cacheControl = isHashedAsset
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600';

  return new Response(file, {
    headers: {
      'Cache-Control': cacheControl,
      'Content-Type': file.type,
    },
  });
}

/**
 * Set up graceful shutdown on SIGINT, SIGTERM, SIGHUP.
 */
function setupGracefulShutdown(server: ReturnType<typeof Bun.serve>): void {
  const shutdown = () => {
    console.log('\nShutting down...');
    server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);
}
