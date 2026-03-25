import type { AppBuilder } from '@vertz/core';
import { installFetchProxy, runWithScopedFetch } from '@vertz/ui-server/fetch-scope';
import type { AotManifest, SSRModule } from '@vertz/ui-server/ssr';
import { injectNonce, lookupCache, storeCache, stripNonce } from './isr-cache.js';

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
  /**
   * AOT manifest with pre-compiled SSR render functions.
   * On Cloudflare Workers (no filesystem), import the manifest at build time
   * and pass it here.
   */
  aotManifest?: AotManifest;
}

/**
 * ISR (Incremental Static Regeneration) cache configuration.
 *
 * When provided, SSR responses are cached in Cloudflare KV.
 * Subsequent requests serve from cache, with background revalidation
 * when the TTL expires (stale-while-revalidate pattern).
 */
export interface CacheConfig {
  /**
   * Factory that returns the KV namespace for page caching.
   * Receives the Worker env bindings.
   */
  kv: (env: unknown) => KVNamespace;

  /** Cache TTL in seconds. Default: 3600 (1 hour). */
  ttl?: number;

  /**
   * When true (default), stale entries are served immediately while
   * a background revalidation runs via `ctx.waitUntil()`.
   * When false, stale entries trigger a synchronous SSR re-render.
   */
  staleWhileRevalidate?: boolean;
}

/**
 * Full-stack configuration for createHandler.
 *
 * Supports lazy app initialization (for D1 bindings), SSR fallback,
 * ISR caching, and automatic security headers.
 */
export interface CloudflareHandlerConfig {
  /**
   * Factory that creates the AppBuilder. Receives the Worker env bindings.
   * Called once on first request, then cached.
   */
  app: (env: unknown) => AppBuilder;

  /** API path prefix. Requests matching this prefix go to the app handler. Default: '/api' */
  basePath?: string;

  /**
   * SSR configuration for non-API routes.
   *
   * - `SSRModuleConfig` — zero-boilerplate: pass the app module directly
   * - `(request: Request) => Promise<Response>` — custom SSR callback
   */
  ssr: SSRModuleConfig | ((request: Request) => Promise<Response>);

  /** When true, adds standard security headers to all responses. */
  securityHeaders?: boolean;

  /**
   * Image optimizer handler for runtime image optimization at the edge.
   * Created via `imageOptimizer()` from `@vertz/cloudflare/image`.
   * Routes `/_vertz/image` requests to the optimizer.
   */
  imageOptimizer?: (request: Request) => Promise<Response>;

  /**
   * ISR cache configuration. Caches SSR responses in Cloudflare KV
   * with TTL-based revalidation. Only applies to SSR routes (not API).
   */
  cache?: CacheConfig;

  /**
   * Middleware hook called before SSR rendering on non-API routes.
   *
   * Return a `Response` to short-circuit (e.g., redirect to `/login`).
   * Return `undefined`/`void` to proceed with normal SSR rendering.
   *
   * Receives the incoming `Request` and the Worker `env` bindings.
   */
  beforeRender?: (
    request: Request,
    env: unknown,
  ) => Response | undefined | Promise<Response | undefined> | Promise<void>;
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

/**
 * Auto-detect requestHandler on ServerInstance (includes auth routing).
 * Falls back to handler for plain AppBuilder.
 */
function getApiHandler(app: AppBuilder): (request: Request) => Promise<Response> {
  if (
    'requestHandler' in app &&
    typeof (app as Record<string, unknown>).requestHandler === 'function'
  ) {
    return (app as Record<string, unknown>).requestHandler as (req: Request) => Promise<Response>;
  }
  return app.handler;
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
  const {
    basePath: configBasePath,
    ssr,
    imageOptimizer: imageOptimizerHandler,
    cache: cacheConfig,
    beforeRender,
  } = config;
  const basePath = configBasePath ?? '/api';
  const securityHeaders = config.securityHeaders !== false;
  const cacheTtl = cacheConfig?.ttl ?? 3600;
  const swr = cacheConfig?.staleWhileRevalidate !== false;
  // Install per-request fetch proxy once (idempotent)
  installFetchProxy();
  let cachedApp: AppBuilder | null = null;
  let cachedKV: KVNamespace | null = null;
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

  function getKV(env: unknown): KVNamespace | null {
    if (!cacheConfig) return null;
    if (!cachedKV) {
      cachedKV = cacheConfig.kv(env);
    }
    return cachedKV;
  }

  async function resolveSSR(): Promise<void> {
    if (ssrResolved) return;
    ssrResolved = true;

    if (isSSRModuleConfig(ssr)) {
      const { createSSRHandler } = await import('@vertz/ui-server/ssr');
      const {
        module,
        clientScript = '/assets/entry-client.js',
        title = 'Vertz App',
        ssrTimeout = 5000,
        aotManifest,
      } = ssr;
      // Return a factory that creates an SSR handler with the per-request nonce
      ssrHandlerFactory = (nonce?: string) =>
        createSSRHandler({
          module,
          template: generateHTMLTemplate(clientScript, title, nonce),
          ssrTimeout,
          nonce,
          aotManifest,
        });
    } else {
      // Custom callback — wrap it in a factory that ignores the nonce
      ssrHandlerFactory = () => ssr;
    }
  }

  function applyHeaders(response: Response, nonce: string): Response {
    return securityHeaders ? withSecurityHeaders(response, nonce) : response;
  }

  /** Execute SSR with fetch scoping and return the HTML string. */
  async function executeSSR(request: Request, nonce: string, env: unknown): Promise<Response> {
    const app = getApp(env);
    const ssrHandler = ssrHandlerFactory!(nonce);
    const origin = new URL(request.url).origin;
    const interceptor: typeof fetch = (input, init) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const isRelative = rawUrl.startsWith('/');
      const pathname = isRelative ? (rawUrl.split('?')[0] ?? '/') : new URL(rawUrl).pathname;
      const isLocal = isRelative || new URL(rawUrl).origin === origin;

      if (isLocal && pathname.startsWith(basePath)) {
        const absoluteUrl = isRelative ? `${origin}${rawUrl}` : rawUrl;
        const req = new Request(absoluteUrl, init);
        return getApiHandler(app)(req);
      }
      return globalThis.fetch(input, init);
    };
    return runWithScopedFetch(interceptor, () => ssrHandler(request));
  }

  /** Add X-Vertz-Cache header to a response. */
  function withCacheHeader(response: Response, status: 'HIT' | 'MISS' | 'STALE'): Response {
    const headers = new Headers(response.headers);
    headers.set('X-Vertz-Cache', status);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return {
    async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
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
          const response = await getApiHandler(app)(request);
          return applyHeaders(response, nonce);
        } catch (error) {
          console.error('Unhandled error in worker:', error);
          return applyHeaders(new Response('Internal Server Error', { status: 500 }), nonce);
        }
      }

      // beforeRender middleware — runs before SSR on non-API routes
      if (beforeRender) {
        const earlyResponse = await beforeRender(request, env);
        if (earlyResponse) {
          return applyHeaders(earlyResponse, nonce);
        }
      }

      // Non-API routes → SSR (with optional ISR caching)
      const kv = getKV(env);

      // ISR cache: check KV before SSR
      if (kv) {
        try {
          const cacheResult = await lookupCache(kv, url.pathname, cacheTtl);

          if (cacheResult.status === 'HIT' && cacheResult.html) {
            // Inject fresh nonce into cached HTML (stored without nonce)
            const html = injectNonce(cacheResult.html, nonce);
            const response = new Response(html, {
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
            return applyHeaders(withCacheHeader(response, 'HIT'), nonce);
          }

          if (cacheResult.status === 'STALE' && cacheResult.html && swr) {
            // Serve stale immediately, revalidate in background
            const kvExpiry = cacheTtl * 2;
            ctx.waitUntil(
              (async () => {
                try {
                  const freshResponse = await executeSSR(request, nonce, env);
                  const freshHtml = await freshResponse.text();
                  // Strip nonce before caching — each request gets its own nonce
                  await storeCache(kv, url.pathname, stripNonce(freshHtml), kvExpiry);
                } catch {
                  // Background revalidation failure is non-fatal
                }
              })(),
            );
            // Inject fresh nonce into stale HTML
            const html = injectNonce(cacheResult.html, nonce);
            const response = new Response(html, {
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
            return applyHeaders(withCacheHeader(response, 'STALE'), nonce);
          }
        } catch {
          // KV lookup failure is non-fatal — fall through to SSR
        }
      }

      // Cache MISS (or no cache configured) → SSR
      try {
        const response = await executeSSR(request, nonce, env);

        // Store in KV for future requests
        if (kv) {
          const html = await response.text();
          // Strip nonce before caching — each request gets its own nonce
          const kvExpiry = cacheTtl * 2;
          ctx.waitUntil(storeCache(kv, url.pathname, stripNonce(html), kvExpiry));
          const cachedResponse = new Response(html, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
          return applyHeaders(withCacheHeader(cachedResponse, 'MISS'), nonce);
        }

        return applyHeaders(response, nonce);
      } catch (error) {
        console.error('Unhandled error in worker:', error);
        return applyHeaders(new Response('Internal Server Error', { status: 500 }), nonce);
      }
    },
  };
}
