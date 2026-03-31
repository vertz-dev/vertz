/**
 * Vertz Component Docs — Cloudflare Worker
 *
 * Optimized edge delivery for the component documentation site:
 * 1. Cache API — Worker-level cache eliminates ASSETS.fetch() on warm requests
 * 2. Deploy-versioned cache keys — instant cache invalidation on deploy
 * 3. SPA fallback — unknown routes serve index.html for client-side routing
 * 4. Brotli content negotiation — serves pre-compressed .br assets when available
 * 5. Security headers — nosniff, DENY frame, strict referrer
 */

// Minimal ambient declarations for Cloudflare Worker APIs.
// The component-docs tsconfig uses bun-types, which doesn't include these.
// At runtime, wrangler provides the real implementations.
declare interface Fetcher {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}
declare interface ExportedHandler<E = unknown> {
  fetch(request: Request, env: E): Promise<Response>;
}
declare const caches: { default: Cache };

interface Env {
  ASSETS: Fetcher;
}

/**
 * Deploy version — injected at build time via wrangler --define.
 * Used to namespace Cache API keys so that new deploys get fresh cache entries.
 * Old entries are evicted by LRU. Hashed assets (/assets/*) don't need this
 * because their URLs already change on content change.
 */
declare const DEPLOY_VERSION: string;

// ── Cache policies ─────────────────────────────────────────────────

/** Hashed assets (JS, CSS in /assets/) — immutable, cache forever. */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

/** Fonts — long-lived, rarely change. */
const FONT_CACHE = 'public, max-age=31536000, immutable';

/** Images and other static files — cache with revalidation. */
const STATIC_CACHE = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400';

/**
 * HTML pages — short browser cache, long edge cache with stale-while-revalidate.
 * Edge serves instantly from cache; revalidates async after deploy.
 */
const HTML_CACHE = 'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400';

// ── Compressible file types for Brotli pre-compression ─────────────

const COMPRESSIBLE_EXTENSIONS = new Set(['.html', '.js', '.css', '.svg', '.xml', '.txt', '.json']);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const isHTML = isHTMLRoute(pathname);

    // ── 1. Check Worker-level cache (Cache API) ─────────────────
    // Mutable content (HTML) uses a versioned cache key so deploys
    // instantly invalidate without needing API-based cache purge.
    // Immutable content (hashed assets, fonts) uses the raw URL.
    const cache = caches.default;
    const cacheKey = buildCacheKey(url, isHTML);

    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    // ── 2. Fetch from ASSETS binding ────────────────────────────
    const cacheControl = getCacheControl(pathname);

    // Try Brotli pre-compressed version first, fall back to original
    let assetResponse: Response =
      (await tryBrotli(request, env, pathname)) ?? (await env.ASSETS.fetch(request));

    // ── 3. SPA fallback ─────────────────────────────────────────
    // wrangler's not_found_handling = "single-page-application" is
    // the safety net, but we handle it explicitly for cache control.
    if (assetResponse.status === 404 && isHTML) {
      const fallbackRequest = new Request(new URL('/', request.url), request);
      assetResponse = await env.ASSETS.fetch(fallbackRequest);
    }

    // ── 4. Add performance headers ──────────────────────────────
    const response = addHeaders(assetResponse, cacheControl);

    // ── 5. Store in Worker-level cache ──────────────────────────
    if (response.status === 200) {
      cache.put(cacheKey, response.clone());
    }

    return response;
  },
} satisfies ExportedHandler<Env>;

// ── Cache key construction ────────────────────────────────────────

/**
 * Build a cache key for the request.
 *
 * - HTML pages: URL + deploy version → cache invalidated on every deploy
 * - Hashed assets: raw URL → cached forever (URL changes on content change)
 */
export function buildCacheKey(url: URL, isHTML: boolean): Request {
  if (isHTML) {
    const versionedUrl = new URL(url.toString());
    versionedUrl.searchParams.set('__v', DEPLOY_VERSION);
    return new Request(versionedUrl.toString(), { method: 'GET' });
  }
  return new Request(url.toString(), { method: 'GET' });
}

/**
 * Try to serve a pre-compressed Brotli version of the asset.
 * Returns null if client doesn't accept Brotli or .br file doesn't exist.
 */
export async function tryBrotli(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const ext = pathname.substring(pathname.lastIndexOf('.'));
  if (!COMPRESSIBLE_EXTENSIONS.has(ext)) return null;

  const acceptEncoding = request.headers.get('Accept-Encoding') || '';
  if (!acceptEncoding.includes('br')) return null;

  const brUrl = new URL(request.url);
  brUrl.pathname = `${pathname}.br`;
  const brRequest = new Request(brUrl.toString(), request);

  try {
    const brResponse = await env.ASSETS.fetch(brRequest);
    if (brResponse.status === 200) {
      const headers = new Headers(brResponse.headers);
      headers.set('Content-Encoding', 'br');
      headers.set('Content-Type', getContentType(pathname));
      return new Response(brResponse.body, { status: 200, headers });
    }
  } catch {
    // .br file doesn't exist, fall through
  }

  return null;
}

/** Build a new response with cache and security headers. */
export function addHeaders(response: Response, cacheControl: string): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', cacheControl);

  // Security headers
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Determine the cache control header based on the request path. */
export function getCacheControl(pathname: string): string {
  if (pathname.startsWith('/assets/')) return IMMUTABLE_CACHE;
  if (pathname.startsWith('/fonts/') || pathname.endsWith('.woff2')) return FONT_CACHE;
  if (/\.\w{2,5}$/.test(pathname) && !pathname.endsWith('.html')) return STATIC_CACHE;
  return HTML_CACHE;
}

/** Check if a path looks like an HTML page route (no file extension, or .html). */
export function isHTMLRoute(pathname: string): boolean {
  if (pathname.endsWith('.html')) return true;
  return !/\.\w{2,5}$/.test(pathname);
}

/** Map file extensions to MIME types for Brotli responses. */
export function getContentType(pathname: string): string {
  const ext = pathname.substring(pathname.lastIndexOf('.'));
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.xml':
      return 'application/xml';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.txt':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}
