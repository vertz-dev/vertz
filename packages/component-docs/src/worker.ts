/**
 * Vertz Component Docs — Cloudflare Worker
 *
 * Lightweight edge Worker that:
 * 1. Reads the `theme` cookie from the request
 * 2. Patches pre-rendered HTML with the correct `data-theme` attribute
 * 3. Serves static assets with optimized cache headers
 * 4. Adds security headers
 *
 * This avoids full SSR — the build already pre-renders all routes.
 * The only cookie-dependent part is the theme attribute on the root div.
 * String replacement is ~0.1ms vs ~3ms for full SSR.
 */

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

// ── Theme cookie parsing ───────────────────────────────────────────

function getThemeFromCookie(request: Request): 'dark' | 'light' {
  const cookie = request.headers.get('Cookie') ?? '';
  const match = cookie.match(/(?:^|; )theme=(light|dark)/);
  return (match?.[1] as 'dark' | 'light') ?? 'dark';
}

// ── Route classification ───────────────────────────────────────────

/** Check if a path is a static asset (not an HTML page route). */
function isStaticAsset(pathname: string): boolean {
  // Hashed assets, fonts, images, etc.
  if (pathname.startsWith('/assets/')) return true;
  if (pathname.startsWith('/fonts/')) return true;
  // Files with extensions (except .html) are static assets
  if (/\.\w{2,5}$/.test(pathname) && !pathname.endsWith('.html')) return true;
  return false;
}

/** Determine cache control based on asset type. */
function getCacheControl(pathname: string): string {
  if (pathname.startsWith('/assets/')) return IMMUTABLE_CACHE;
  if (pathname.startsWith('/fonts/') || pathname.endsWith('.woff2')) return FONT_CACHE;
  return STATIC_CACHE;
}

// ── Theme patching ─────────────────────────────────────────────────

const DARK_THEME_COLOR = '#111110';
const LIGHT_THEME_COLOR = '#fafafa';

/**
 * Patch theme-dependent values in pre-rendered HTML.
 * Only modifies the HTML element attribute and meta theme-color,
 * NOT the CSS selectors (which use bracket syntax `[data-theme="dark"]`).
 */
function patchTheme(html: string, theme: 'dark' | 'light'): string {
  if (theme === 'dark') return html;

  // Replace the HTML element's data-theme attribute (not CSS selectors)
  // CSS selectors use [data-theme="dark"], HTML uses data-theme="dark"
  // We target the specific pattern: `<div data-theme="dark">`
  let patched = html.replace('<div data-theme="dark">', '<div data-theme="light">');

  // Update meta theme-color for light mode
  patched = patched.replace(`content="${DARK_THEME_COLOR}"`, `content="${LIGHT_THEME_COLOR}"`);

  return patched;
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

    // ── HTML routes: fetch pre-rendered, patch theme ───────────
    const theme = getThemeFromCookie(request);
    const assetResponse = await env.ASSETS.fetch(request);

    if (assetResponse.status !== 200) {
      return assetResponse;
    }

    const html = await assetResponse.text();
    const patched = patchTheme(html, theme);

    const headers = new Headers();
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Cache-Control', HTML_CACHE);
    headers.set('Vary', 'Cookie');
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(key, value);
    }

    return new Response(patched, { status: 200, headers });
  },
} satisfies ExportedHandler<Env>;
