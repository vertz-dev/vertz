import type { AppBuilder } from '@vertz/core';
import { installFetchProxy, runWithScopedFetch } from '@vertz/ui-server/fetch-scope';
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

  /**
   * Image optimizer handler for runtime image optimization at the edge.
   * Created via `imageOptimizer()` from `@vertz/cloudflare/image`.
   * Routes `/_vertz/image` requests to the optimizer.
   */
  imageOptimizer?: (request: Request) => Promise<Response>;
}

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

/** Generate a cryptographically random nonce for CSP. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Base64-encode without padding for a compact, URL-safe nonce
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

const STATIC_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

function buildCSPHeader(nonce: string): string {
  return `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;`;
}

function withSecurityHeaders(response: Response, nonce: string): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  headers.set('Content-Security-Policy', buildCSPHeader(nonce));
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

export function generateHTMLTemplate(clientScript: string, title: string, nonce?: string): string {
  const nonceAttr = nonce != null ? ` nonce="${nonce}"` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
</head>
<body>
<div id="app"><!--ssr-outlet--></div>
<script type="module" src="${clientScript}"${nonceAttr}></script>
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
  const { basePath, ssr, securityHeaders, imageOptimizer: imageOptimizerHandler } = config;
  // Install per-request fetch proxy once (idempotent)
  installFetchProxy();
  let cachedApp: AppBuilder | null = null;
  // SSR handler factory: when using SSRModuleConfig with nonce support, this
  // is called per-request with the current nonce. For custom callbacks it
  // is set once and always returns the same handler.
  let ssrHandlerFactory: ((nonce?: string) => (request: Request) => Promise<Response>) | null =
    null;
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
      // Return a factory that creates an SSR handler with the per-request nonce
      ssrHandlerFactory = (nonce?: string) =>
        createSSRHandler({
          module,
          template: generateHTMLTemplate(clientScript, title, nonce),
          ssrTimeout,
          nonce,
        });
    } else {
      // Custom callback — wrap it in a factory that ignores the nonce
      ssrHandlerFactory = () => ssr;
    }
  }

  function applyHeaders(response: Response, nonce: string): Response {
    return securityHeaders ? withSecurityHeaders(response, nonce) : response;
  }

  return {
    async fetch(request: Request, env: unknown, _ctx: ExecutionContext): Promise<Response> {
      await resolveSSR();
      const url = new URL(request.url);
      const nonce = generateNonce();

      // Image optimizer route — highest priority, before API and SSR
      if (url.pathname === '/_vertz/image' && imageOptimizerHandler) {
        const response = await imageOptimizerHandler(request);
        return applyHeaders(response, nonce);
      }

      // Route splitting: basePath/* → API handler (no URL rewriting — the
      // app's own basePath/apiPrefix handles prefix matching internally)
      if (url.pathname.startsWith(basePath)) {
        try {
          const app = getApp(env);
          const response = await app.handler(request);
          return applyHeaders(response, nonce);
        } catch (error) {
          console.error('Unhandled error in worker:', error);
          return applyHeaders(new Response('Internal Server Error', { status: 500 }), nonce);
        }
      }

      // Non-API routes → SSR or 404
      if (ssrHandlerFactory) {
        const app = getApp(env);
        const ssrHandler = ssrHandlerFactory(nonce);
        const origin = url.origin;
        // Scope fetch interception per-request via AsyncLocalStorage.
        // API requests (e.g. query() calling fetch('/api/todos')) route
        // through the in-memory app handler. No globalThis.fetch mutation.
        const interceptor: typeof fetch = (input, init) => {
          const rawUrl =
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          const isRelative = rawUrl.startsWith('/');
          const pathname = isRelative ? (rawUrl.split('?')[0] ?? '/') : new URL(rawUrl).pathname;
          const isLocal = isRelative || new URL(rawUrl).origin === origin;

          if (isLocal && pathname.startsWith(basePath)) {
            const absoluteUrl = isRelative ? `${origin}${rawUrl}` : rawUrl;
            const req = new Request(absoluteUrl, init);
            return app.handler(req);
          }
          return globalThis.fetch(input, init);
        };
        try {
          const response = await runWithScopedFetch(interceptor, () => ssrHandler(request));
          return applyHeaders(response, nonce);
        } catch (error) {
          console.error('Unhandled error in worker:', error);
          return applyHeaders(new Response('Internal Server Error', { status: 500 }), nonce);
        }
      }

      return applyHeaders(new Response('Not Found', { status: 404 }), nonce);
    },
  };
}
