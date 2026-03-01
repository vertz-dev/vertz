import type { AppBuilder } from '@vertz/core';
import type { SSRModule } from '@vertz/ui-server/ssr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CloudflareHandlerOptions {
  basePath?: string;
}

/**
 * SSR module configuration for zero-boilerplate server-side rendering.
 *
 * Pass the app module directly and the handler generates the HTML template,
 * wires up createSSRHandler, and handles the full SSR pipeline.
 */
export interface SSRModuleConfig {
  /** App module exporting App, theme?, styles?, getInjectedCSS? */
  module: SSRModule;
  /** Client-side entry script path. Default: '/assets/entry-client.js' */
  clientScript?: string;
  /** HTML document title. Default: 'Vertz App' */
  title?: string;
  /** SSR query timeout in ms. Default: 5000 (generous for D1 cold starts). */
  ssrTimeout?: number;
}

/**
 * Full-stack configuration for createHandler.
 *
 * Supports lazy app initialization (for D1 bindings), SSR fallback,
 * and automatic security headers.
 */
export interface CloudflareHandlerConfig {
  /**
   * Factory that creates the AppBuilder. Receives the Worker env bindings.
   * Called once on first request, then cached.
   */
  app: (env: unknown) => AppBuilder;

  /** API path prefix. Requests matching this prefix go to the app handler. */
  basePath: string;

  /**
   * SSR configuration for non-API routes.
   *
   * - `SSRModuleConfig` — zero-boilerplate: pass the app module directly
   * - `(request: Request) => Promise<Response>` — custom SSR callback
   * - `undefined` — non-API requests return 404
   */
  ssr?: SSRModuleConfig | ((request: Request) => Promise<Response>);

  /** When true, adds standard security headers to all responses. */
  securityHeaders?: boolean;
}

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripBasePath(request: Request, basePath: string): Request {
  const url = new URL(request.url);
  if (url.pathname.startsWith(basePath)) {
    url.pathname = url.pathname.slice(basePath.length) || '/';
    return new Request(url.toString(), request);
  }
  return request;
}

// ---------------------------------------------------------------------------
// createHandler overloads
// ---------------------------------------------------------------------------

/**
 * Create a Cloudflare Worker handler from a Vertz app.
 *
 * Simple form — wraps an AppBuilder directly:
 * ```ts
 * export default createHandler(app, { basePath: '/api' });
 * ```
 *
 * Config form — full-stack with lazy init, SSR, and security headers:
 * ```ts
 * export default createHandler({
 *   app: (env) => createServer({ entities, db: createDb({ d1: env.DB }) }),
 *   basePath: '/api',
 *   ssr: (req) => renderToString(new URL(req.url).pathname),
 *   securityHeaders: true,
 * });
 * ```
 */
/** Worker module shape returned by createHandler. */
export interface CloudflareWorkerModule {
  fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response>;
}

export function createHandler(
  appOrConfig: AppBuilder | CloudflareHandlerConfig,
  options?: CloudflareHandlerOptions,
): CloudflareWorkerModule {
  // Config object form
  if ('app' in appOrConfig && typeof appOrConfig.app === 'function') {
    return createFullStackHandler(appOrConfig);
  }

  // Simple AppBuilder form (backward compat)
  return createSimpleHandler(appOrConfig as AppBuilder, options);
}

// ---------------------------------------------------------------------------
// Simple handler (backward compat)
// ---------------------------------------------------------------------------

function createSimpleHandler(
  app: AppBuilder,
  options?: CloudflareHandlerOptions,
): CloudflareWorkerModule {
  const handler = app.handler;

  return {
    async fetch(request: Request, _env: unknown, _ctx: ExecutionContext): Promise<Response> {
      if (options?.basePath) {
        request = stripBasePath(request, options.basePath);
      }
      try {
        return await handler(request);
      } catch (error) {
        console.error('Unhandled error in worker:', error);
        return new Response('Internal Server Error', { status: 500 });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// HTML template generation
// ---------------------------------------------------------------------------

export function generateHTMLTemplate(clientScript: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
</head>
<body>
<div id="app"><!--ssr-outlet--></div>
<script type="module" src="${clientScript}"></script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Full-stack handler
// ---------------------------------------------------------------------------

function isSSRModuleConfig(
  ssr: SSRModuleConfig | ((request: Request) => Promise<Response>),
): ssr is SSRModuleConfig {
  return typeof ssr === 'object' && 'module' in ssr;
}

function createFullStackHandler(config: CloudflareHandlerConfig): CloudflareWorkerModule {
  const { basePath, ssr, securityHeaders } = config;
  let cachedApp: AppBuilder | null = null;
  let ssrHandler: ((request: Request) => Promise<Response>) | null = null;
  let ssrResolved = false;

  function getApp(env: unknown): AppBuilder {
    if (!cachedApp) {
      cachedApp = config.app(env);
    }
    return cachedApp;
  }

  async function resolveSSR(): Promise<void> {
    if (ssrResolved) return;
    ssrResolved = true;

    if (!ssr) return;

    if (isSSRModuleConfig(ssr)) {
      const { createSSRHandler } = await import('@vertz/ui-server/ssr');
      const {
        module,
        clientScript = '/assets/entry-client.js',
        title = 'Vertz App',
        ssrTimeout = 5000,
      } = ssr;
      ssrHandler = createSSRHandler({
        module,
        template: generateHTMLTemplate(clientScript, title),
        ssrTimeout,
      });
    } else {
      ssrHandler = ssr;
    }
  }

  function applyHeaders(response: Response): Response {
    return securityHeaders ? withSecurityHeaders(response) : response;
  }

  return {
    async fetch(request: Request, env: unknown, _ctx: ExecutionContext): Promise<Response> {
      await resolveSSR();
      const url = new URL(request.url);

      // Route splitting: basePath/* → API handler (no URL rewriting — the
      // app's own basePath/apiPrefix handles prefix matching internally)
      if (url.pathname.startsWith(basePath)) {
        try {
          const app = getApp(env);
          const response = await app.handler(request);
          return applyHeaders(response);
        } catch (error) {
          console.error('Unhandled error in worker:', error);
          return applyHeaders(new Response('Internal Server Error', { status: 500 }));
        }
      }

      // Non-API routes → SSR or 404
      if (ssrHandler) {
        const app = getApp(env);
        const origin = url.origin;
        // Patch fetch during SSR so API requests (e.g. query() calling
        // fetch('/api/todos')) are routed through the in-memory app handler
        // instead of attempting a network self-fetch (which fails on Workers).
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (input, init) => {
          // Determine the pathname from the input (string, URL, or Request)
          const rawUrl =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.href
                : input.url;
          const isRelative = rawUrl.startsWith('/');
          const pathname = isRelative
            ? rawUrl.split('?')[0]
            : new URL(rawUrl).pathname;
          const isLocal = isRelative || new URL(rawUrl).origin === origin;

          if (isLocal && pathname.startsWith(basePath)) {
            // Build an absolute URL so Request() doesn't reject relative URLs
            const absoluteUrl = isRelative ? `${origin}${rawUrl}` : rawUrl;
            const req = new Request(absoluteUrl, init);
            return app.handler(req);
          }
          return originalFetch(input, init);
        };
        try {
          const response = await ssrHandler(request);
          return applyHeaders(response);
        } catch (error) {
          console.error('Unhandled error in worker:', error);
          return applyHeaders(new Response('Internal Server Error', { status: 500 }));
        } finally {
          globalThis.fetch = originalFetch;
        }
      }

      return applyHeaders(new Response('Not Found', { status: 404 }));
    },
  };
}
