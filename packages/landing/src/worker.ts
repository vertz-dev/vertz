/**
 * Vertz Landing — Cloudflare Worker
 *
 * Optimized edge delivery for pre-rendered static pages:
 * 1. Cache API — Worker-level cache eliminates ASSETS.fetch() on warm requests
 * 2. Deploy-versioned cache keys — instant cache invalidation on deploy
 * 3. Early Hints (103) — preload CSS/fonts before HTML arrives
 * 4. Aggressive edge caching — s-maxage + stale-while-revalidate
 * 5. Brotli content negotiation — serves pre-compressed .br assets when available
 * 6. SPA fallback — unknown routes serve index.html
 * 7. Security headers — nosniff, DENY frame, strict referrer
 */

import { LLMS_TXT } from './llms-txt';

// Re-export PresenceRoom for Cloudflare Durable Object binding
export { PresenceRoom } from './presence-room';

// Minimal ambient declarations for Cloudflare Worker APIs.
// The landing page tsconfig uses bun-types, which doesn't include these.
// At runtime, wrangler provides the real implementations.
declare interface Fetcher {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}
declare interface ExportedHandler<E = unknown> {
  fetch(request: Request, env: E): Promise<Response>;
}
declare const caches: { default: Cache };

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
interface DurableObjectId {}
interface DurableObjectStub {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}

interface Env {
  ASSETS: Fetcher;
  PRESENCE_ROOM: DurableObjectNamespace;
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

/** Early Hints link headers for HTML pages — preload critical resources. */
const EARLY_HINT_LINKS = [
  '</assets/vertz.css>; rel=preload; as=style',
  '</fonts/dm-sans-latin.woff2>; rel=preload; as=font; type=font/woff2; crossorigin',
];

// ── Compressible file types for Brotli pre-compression ─────────────

const COMPRESSIBLE_EXTENSIONS = new Set(['.html', '.js', '.css', '.svg', '.xml', '.txt', '.json']);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // ── 0a. Presence WebSocket upgrade ─────────────────────────
    if (pathname === '/__presence') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }

      const roomId = env.PRESENCE_ROOM.idFromName('landing');
      const room = env.PRESENCE_ROOM.get(roomId);
      return room.fetch(request);
    }

    // ── 0b. LLM-friendly entry point ───────────────────────────
    if (pathname === '/llms.txt') {
      return new Response(LLMS_TXT, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': STATIC_CACHE,
        },
      });
    }

    // ── 0c. Redirect /docs/* to docs.vertz.dev ────────────────
    if (pathname === '/docs' || pathname.startsWith('/docs/')) {
      const subpath = pathname.replace(/^\/docs\/?/, '');
      const target = subpath ? `https://docs.vertz.dev/${subpath}` : 'https://docs.vertz.dev';
      return Response.redirect(target, 301);
    }

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
    if (assetResponse.status === 404 && isHTML) {
      const fallbackRequest = new Request(new URL('/', request.url), request);
      assetResponse = await env.ASSETS.fetch(fallbackRequest);
    }

    // ── 4. Add performance headers ──────────────────────────────
    const response = addHeaders(assetResponse, cacheControl, isHTML);

    // ── 5. Store in Worker-level cache ──────────────────────────
    if (response.status === 200) {
      // Clone before caching since the body can only be consumed once
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
function buildCacheKey(url: URL, isHTML: boolean): Request {
  if (isHTML) {
    // Append deploy version as a query param to namespace the cache entry.
    // This never reaches the client — it's only used as a Cache API key.
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
async function tryBrotli(request: Request, env: Env, pathname: string): Promise<Response | null> {
  // Only attempt for compressible file types
  const ext = pathname.substring(pathname.lastIndexOf('.'));
  if (!COMPRESSIBLE_EXTENSIONS.has(ext)) return null;

  // Check if client accepts Brotli
  const acceptEncoding = request.headers.get('Accept-Encoding') || '';
  if (!acceptEncoding.includes('br')) return null;

  // Try fetching the .br version
  const brUrl = new URL(request.url);
  brUrl.pathname = `${pathname}.br`;
  const brRequest = new Request(brUrl.toString(), request);

  try {
    const brResponse = await env.ASSETS.fetch(brRequest);
    if (brResponse.status === 200) {
      // Serve with Content-Encoding: br and the original Content-Type
      const headers = new Headers(brResponse.headers);
      headers.set('Content-Encoding', 'br');
      headers.set('Content-Type', getContentType(pathname));
      return new Response(brResponse.body, {
        status: 200,
        headers,
      });
    }
  } catch {
    // .br file doesn't exist, fall through
  }

  return null;
}

/** Build a new response with cache and performance headers. */
function addHeaders(
  response: Response,
  cacheControl: string,
  includeEarlyHints: boolean,
): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', cacheControl);

  // Early Hints — Cloudflare reads Link headers and sends 103 automatically
  if (includeEarlyHints) {
    for (const link of EARLY_HINT_LINKS) {
      headers.append('Link', link);
    }
  }

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
function getCacheControl(pathname: string): string {
  if (pathname.startsWith('/assets/')) return IMMUTABLE_CACHE;
  if (pathname.startsWith('/__vertz_img/')) return IMMUTABLE_CACHE;
  if (pathname.startsWith('/fonts/') || pathname.endsWith('.woff2')) return FONT_CACHE;
  if (/\.\w{2,4}$/.test(pathname) && !pathname.endsWith('.html')) return STATIC_CACHE;
  return HTML_CACHE;
}

/** Check if a path looks like an HTML page route (no file extension, or .html). */
function isHTMLRoute(pathname: string): boolean {
  if (pathname.endsWith('.html')) return true;
  return !/\.\w{2,4}$/.test(pathname);
}

/** Map file extensions to MIME types for Brotli responses. */
function getContentType(pathname: string): string {
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
