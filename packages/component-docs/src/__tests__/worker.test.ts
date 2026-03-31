import { describe, expect, it } from 'bun:test';
import {
  addHeaders,
  buildCacheKey,
  getCacheControl,
  getContentType,
  isHTMLRoute,
  tryBrotli,
} from '../worker';

// ── isHTMLRoute ─────────────────────────────────────────────────

describe('isHTMLRoute', () => {
  it('returns true for paths without file extensions', () => {
    expect(isHTMLRoute('/')).toBe(true);
    expect(isHTMLRoute('/overview')).toBe(true);
    expect(isHTMLRoute('/components/button')).toBe(true);
  });

  it('returns true for .html paths', () => {
    expect(isHTMLRoute('/index.html')).toBe(true);
    expect(isHTMLRoute('/overview/index.html')).toBe(true);
  });

  it('returns false for static asset paths', () => {
    expect(isHTMLRoute('/assets/chunk-abc123.js')).toBe(false);
    expect(isHTMLRoute('/assets/style.css')).toBe(false);
    expect(isHTMLRoute('/fonts/geist.woff2')).toBe(false);
    expect(isHTMLRoute('/favicon.ico')).toBe(false);
    expect(isHTMLRoute('/image.png')).toBe(false);
  });
});

// ── getCacheControl ─────────────────────────────────────────────

describe('getCacheControl', () => {
  it('returns immutable for hashed assets in /assets/', () => {
    expect(getCacheControl('/assets/chunk-abc123.js')).toBe('public, max-age=31536000, immutable');
    expect(getCacheControl('/assets/style-xyz.css')).toBe('public, max-age=31536000, immutable');
  });

  it('returns immutable for font files', () => {
    expect(getCacheControl('/fonts/geist.woff2')).toBe('public, max-age=31536000, immutable');
    expect(getCacheControl('/fonts/mono-latin.woff2')).toBe('public, max-age=31536000, immutable');
  });

  it('returns static cache for other files with extensions', () => {
    expect(getCacheControl('/favicon.ico')).toBe(
      'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
    );
    expect(getCacheControl('/image.png')).toBe(
      'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
    );
  });

  it('returns HTML cache for routes without extensions', () => {
    expect(getCacheControl('/')).toBe(
      'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400',
    );
    expect(getCacheControl('/components/button')).toBe(
      'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400',
    );
    expect(getCacheControl('/overview')).toBe(
      'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400',
    );
  });
});

// ── buildCacheKey ───────────────────────────────────────────────

// @ts-expect-error — inject DEPLOY_VERSION for tests
globalThis.DEPLOY_VERSION = 'test-v1';

describe('buildCacheKey', () => {
  it('appends deploy version for HTML routes', () => {
    const url = new URL('https://components.vertz.dev/components/button');
    const key = buildCacheKey(url, true);
    expect(key.url).toBe('https://components.vertz.dev/components/button?__v=test-v1');
    expect(key.method).toBe('GET');
  });

  it('uses raw URL for non-HTML routes', () => {
    const url = new URL('https://components.vertz.dev/assets/chunk-abc.js');
    const key = buildCacheKey(url, false);
    expect(key.url).toBe('https://components.vertz.dev/assets/chunk-abc.js');
    expect(key.method).toBe('GET');
  });

  it('preserves existing query params for HTML routes', () => {
    const url = new URL('https://components.vertz.dev/overview?tab=form');
    const key = buildCacheKey(url, true);
    const parsed = new URL(key.url);
    expect(parsed.searchParams.get('tab')).toBe('form');
    expect(parsed.searchParams.get('__v')).toBe('test-v1');
  });
});

// ── getContentType ──────────────────────────────────────────────

describe('getContentType', () => {
  it('returns correct MIME types for known extensions', () => {
    expect(getContentType('/index.html')).toBe('text/html; charset=utf-8');
    expect(getContentType('/app.js')).toBe('application/javascript; charset=utf-8');
    expect(getContentType('/style.css')).toBe('text/css; charset=utf-8');
    expect(getContentType('/logo.svg')).toBe('image/svg+xml');
    expect(getContentType('/data.json')).toBe('application/json; charset=utf-8');
    expect(getContentType('/robots.txt')).toBe('text/plain; charset=utf-8');
  });

  it('returns octet-stream for unknown extensions', () => {
    expect(getContentType('/file.wasm')).toBe('application/octet-stream');
    expect(getContentType('/font.woff2')).toBe('application/octet-stream');
  });
});

// ── addHeaders ──────────────────────────────────────────────────

describe('addHeaders', () => {
  it('sets Cache-Control header', () => {
    const response = new Response('ok', { status: 200 });
    const result = addHeaders(response, 'public, max-age=60');
    expect(result.headers.get('Cache-Control')).toBe('public, max-age=60');
  });

  it('sets security headers', () => {
    const response = new Response('ok', { status: 200 });
    const result = addHeaders(response, 'no-cache');
    expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(result.headers.get('X-Frame-Options')).toBe('DENY');
    expect(result.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('preserves original response status', () => {
    const response = new Response('not found', { status: 404, statusText: 'Not Found' });
    const result = addHeaders(response, 'no-cache');
    expect(result.status).toBe(404);
    expect(result.statusText).toBe('Not Found');
  });

  it('preserves existing headers from the response', () => {
    const response = new Response('ok', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
    const result = addHeaders(response, 'no-cache');
    expect(result.headers.get('Content-Type')).toBe('text/html');
  });
});

// ── tryBrotli ───────────────────────────────────────────────────

describe('tryBrotli', () => {
  function makeRequest(url: string, acceptEncoding = 'gzip, deflate, br'): Request {
    return new Request(url, {
      headers: { 'Accept-Encoding': acceptEncoding },
    });
  }

  function makeEnv(brStatus: number): { ASSETS: { fetch: (req: Request) => Promise<Response> } } {
    return {
      ASSETS: {
        fetch: async (req: Request) => {
          if (req.url.endsWith('.br')) {
            return new Response('compressed', { status: brStatus });
          }
          return new Response('original', { status: 200 });
        },
      },
    };
  }

  it('returns null for non-compressible file types', async () => {
    const req = makeRequest('https://example.com/image.png');
    const result = await tryBrotli(req, makeEnv(200) as never, '/image.png');
    expect(result).toBeNull();
  });

  it('returns null when client does not accept Brotli', async () => {
    const req = makeRequest('https://example.com/app.js', 'gzip, deflate');
    const result = await tryBrotli(req, makeEnv(200) as never, '/app.js');
    expect(result).toBeNull();
  });

  it('returns null when .br file does not exist (404)', async () => {
    const req = makeRequest('https://example.com/app.js');
    const result = await tryBrotli(req, makeEnv(404) as never, '/app.js');
    expect(result).toBeNull();
  });

  it('returns Brotli response with correct headers when .br exists', async () => {
    const req = makeRequest('https://example.com/app.js');
    const result = await tryBrotli(req, makeEnv(200) as never, '/app.js');
    expect(result).not.toBeNull();
    expect(result!.headers.get('Content-Encoding')).toBe('br');
    expect(result!.headers.get('Content-Type')).toBe('application/javascript; charset=utf-8');
  });

  it('handles compressible HTML files', async () => {
    const req = makeRequest('https://example.com/index.html');
    const result = await tryBrotli(req, makeEnv(200) as never, '/index.html');
    expect(result).not.toBeNull();
    expect(result!.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
  });

  it('handles compressible CSS files', async () => {
    const req = makeRequest('https://example.com/style.css');
    const result = await tryBrotli(req, makeEnv(200) as never, '/style.css');
    expect(result).not.toBeNull();
    expect(result!.headers.get('Content-Type')).toBe('text/css; charset=utf-8');
  });

  it('returns null when ASSETS.fetch throws', async () => {
    const env = {
      ASSETS: {
        fetch: async () => {
          throw new Error('network error');
        },
      },
    };
    const req = makeRequest('https://example.com/app.js');
    const result = await tryBrotli(req, env as never, '/app.js');
    expect(result).toBeNull();
  });
});
