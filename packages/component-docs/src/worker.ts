/**
 * Vertz Component Docs — Cloudflare Worker
 *
 * Full SSR Worker that:
 * 1. Serves static assets from ASSETS binding with cache headers
 * 2. Renders HTML via `createSSRHandler` (single-pass SSR)
 * 3. Adds security headers to all responses
 *
 * Theme cookie handling: The SSR handler automatically reads the Cookie
 * header from the request and populates `document.cookie` during SSR,
 * so `useTheme()` reads the real cookie value — no Worker-level parsing needed.
 */

import { createSSRHandler } from '@vertz/ui-server/ssr';
// The SSR module is bundled by `vertz build` — wrangler resolves this at Worker build time.
import * as ssrModule from '../dist/server/app.js';

// Ambient declarations for Cloudflare Worker APIs.
// component-docs tsconfig uses bun-types which doesn't include these.
declare interface Fetcher {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}
declare interface ExportedHandler<E = unknown> {
  fetch(request: Request, env: E): Promise<Response>;
}

interface Env {
  ASSETS: Fetcher;
}

// ── Cache policies ─────────────────────────────────────────────────

/** Hashed assets (JS, CSS in /assets/) — immutable, cache forever. */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

/** Fonts — long-lived, rarely change. */
const FONT_CACHE = 'public, max-age=31536000, immutable';

/** Images and other static files — cache with revalidation. */
const STATIC_CACHE = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400';

/**
 * HTML pages — no browser cache (theme-dependent), short edge cache.
 * `Vary: Cookie` ensures edge doesn't serve dark HTML to a light-theme user.
 */
const HTML_CACHE = 'public, max-age=0, s-maxage=60';

// ── Security headers ───────────────────────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// ── Route classification ───────────────────────────────────────────

/** Check if a path is a static asset (not an HTML page route). */
function isStaticAsset(pathname: string): boolean {
  if (pathname.startsWith('/assets/')) return true;
  if (pathname.startsWith('/fonts/')) return true;
  if (/\.\w{2,5}$/.test(pathname) && !pathname.endsWith('.html')) return true;
  return false;
}

/** Determine cache control based on asset type. */
function getCacheControl(pathname: string): string {
  if (pathname.startsWith('/assets/')) return IMMUTABLE_CACHE;
  if (pathname.startsWith('/fonts/') || pathname.endsWith('.woff2')) return FONT_CACHE;
  return STATIC_CACHE;
}

// ── SSR handler (initialized lazily on first HTML request) ─────────

let ssrHandler: ((request: Request) => Promise<Response>) | null = null;
let templatePromise: Promise<string> | null = null;

async function getSSRHandler(env: Env): Promise<(request: Request) => Promise<Response>> {
  if (ssrHandler) return ssrHandler;

  // Fetch the HTML template from the static assets on first request.
  // The template contains <div id="app">…pre-rendered…</div> — the SSR handler
  // replaces the content inside the div with the freshly rendered HTML.
  if (!templatePromise) {
    templatePromise = env.ASSETS.fetch(new Request('https://dummy/index.html')).then((r) =>
      r.text(),
    );
  }

  const template = await templatePromise;

  ssrHandler = createSSRHandler({
    module: ssrModule,
    template,
    cacheControl: HTML_CACHE,
  });

  return ssrHandler;
}

// ── Worker ─────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // ── Static assets: passthrough with cache headers ──────────
    if (isStaticAsset(pathname)) {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 200) return response;

      const headers = new Headers(response.headers);
      headers.set('Cache-Control', getCacheControl(pathname));
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        headers.set(key, value);
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    // ── HTML routes: real SSR ──────────────────────────────────
    // The SSR handler reads the Cookie header automatically and sets
    // document.cookie in the SSR context — no app-level workarounds needed.
    const handler = await getSSRHandler(env);
    const response = await handler(request);

    // Add security headers + Vary: Cookie to SSR response
    const headers = new Headers(response.headers);
    headers.set('Vary', 'Cookie');
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
