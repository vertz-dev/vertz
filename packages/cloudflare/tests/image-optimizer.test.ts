import { afterEach, describe, expect, it, mock } from 'bun:test';
import { imageOptimizer } from '../src/image-optimizer.js';

// Mock global fetch for testing
const originalFetch = globalThis.fetch;

function mockFetchResponse(options: {
  status?: number;
  contentType?: string;
  body?: string;
  headers?: Record<string, string>;
}) {
  const { status = 200, contentType = 'image/jpeg', body = 'image-data', headers = {} } = options;
  return mock((_url: string | Request | URL, _init?: RequestInit) => {
    const resHeaders = new Headers({ 'Content-Type': contentType, ...headers });
    return Promise.resolve(new Response(body, { status, headers: resHeaders }));
  });
}

function makeRequest(
  params: Record<string, string>,
  accept = 'image/avif,image/webp,*/*',
): Request {
  const url = new URL('https://example.com/_vertz/image');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString(), {
    headers: { Accept: accept },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Feature: Edge image optimizer', () => {
  describe('Given an optimizer configured with allowedDomains: ["cdn.example.com"]', () => {
    const handler = imageOptimizer({ allowedDomains: ['cdn.example.com'] });

    describe('When request has valid url, w, and h params', () => {
      it('Then fetches the image with cf.image options', async () => {
        const fetchMock = mockFetchResponse({ headers: { 'cf-resized': 'true' } });
        globalThis.fetch = fetchMock;

        await handler(
          makeRequest({
            url: 'https://cdn.example.com/photo.jpg',
            w: '400',
            h: '300',
          }),
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [fetchUrl, fetchInit] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(fetchUrl).toBe('https://cdn.example.com/photo.jpg');
        const cf = (fetchInit as Record<string, unknown>).cf as {
          image: Record<string, unknown>;
        };
        expect(cf.image.width).toBe(400);
        expect(cf.image.height).toBe(300);
        expect(cf.image.format).toBe('auto');
      });

      it('Then returns Cache-Control: public, max-age=31536000, immutable', async () => {
        globalThis.fetch = mockFetchResponse({ headers: { 'cf-resized': 'true' } });

        const response = await handler(
          makeRequest({
            url: 'https://cdn.example.com/photo.jpg',
            w: '400',
            h: '300',
          }),
        );

        expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
      });

      it('Then returns X-Vertz-Image-Optimized: cf when cf-resized header present', async () => {
        globalThis.fetch = mockFetchResponse({ headers: { 'cf-resized': 'true' } });

        const response = await handler(
          makeRequest({
            url: 'https://cdn.example.com/photo.jpg',
            w: '400',
            h: '300',
          }),
        );

        expect(response.headers.get('X-Vertz-Image-Optimized')).toBe('cf');
      });

      it('Then returns Content-Type from the actual response', async () => {
        globalThis.fetch = mockFetchResponse({
          contentType: 'image/webp',
          headers: { 'cf-resized': 'true' },
        });

        const response = await handler(
          makeRequest({
            url: 'https://cdn.example.com/photo.jpg',
            w: '400',
            h: '300',
          }),
        );

        expect(response.headers.get('Content-Type')).toBe('image/webp');
      });
    });

    describe('When cf.image is not available (no cf-resized header)', () => {
      it('Then returns the original image (passthrough)', async () => {
        globalThis.fetch = mockFetchResponse({ contentType: 'image/jpeg' });

        const response = await handler(
          makeRequest({
            url: 'https://cdn.example.com/photo.jpg',
            w: '400',
            h: '300',
          }),
        );

        expect(response.status).toBe(200);
      });

      it('Then returns X-Vertz-Image-Optimized: passthrough', async () => {
        globalThis.fetch = mockFetchResponse({});

        const response = await handler(
          makeRequest({
            url: 'https://cdn.example.com/photo.jpg',
            w: '400',
            h: '300',
          }),
        );

        expect(response.headers.get('X-Vertz-Image-Optimized')).toBe('passthrough');
      });

      it('Then still returns Cache-Control headers', async () => {
        globalThis.fetch = mockFetchResponse({});

        const response = await handler(
          makeRequest({
            url: 'https://cdn.example.com/photo.jpg',
            w: '400',
            h: '300',
          }),
        );

        expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
      });
    });

    describe('When request has url not in allowedDomains', () => {
      it('Then returns 403 with JSON error body', async () => {
        const fetchMock = mockFetchResponse({});
        globalThis.fetch = fetchMock;

        const response = await handler(
          makeRequest({
            url: 'https://evil.com/photo.jpg',
            w: '400',
            h: '300',
          }),
        );

        expect(response.status).toBe(403);
        const body = (await response.json()) as { error: string };
        expect(body.error).toContain('not in allowedDomains');
        expect(fetchMock).not.toHaveBeenCalled();
      });
    });

    describe('When request has subdomain of allowed domain', () => {
      it('Then returns 403 (exact hostname match, not subdomain match)', async () => {
        const response = await handler(
          makeRequest({
            url: 'https://evil-cdn.example.com/photo.jpg',
            w: '400',
            h: '300',
          }),
        );

        expect(response.status).toBe(403);
      });
    });

    describe('When request is missing the url parameter', () => {
      it('Then returns 400 with JSON error body', async () => {
        const response = await handler(makeRequest({ w: '400', h: '300' }));

        expect(response.status).toBe(400);
        const body = (await response.json()) as { error: string };
        expect(body.error).toContain('url');
      });
    });

    describe('When request has a non-HTTP url', () => {
      it('Then returns 400 with JSON error body', async () => {
        const response = await handler(
          makeRequest({
            url: 'ftp://example.com/photo.jpg',
            w: '400',
            h: '300',
          }),
        );

        expect(response.status).toBe(400);
        const body = (await response.json()) as { error: string };
        expect(body.error).toContain('HTTP');
      });
    });

    describe('When request has an IP address URL', () => {
      it('Then returns 400 (IP addresses rejected)', async () => {
        const response = await handler(
          makeRequest({
            url: 'http://169.254.169.254/latest/meta-data/',
            w: '400',
            h: '300',
          }),
        );

        expect(response.status).toBe(400);
      });
    });

    describe('When request has a URL with credentials', () => {
      it('Then returns 400 (credentials in URL rejected)', async () => {
        const response = await handler(
          makeRequest({
            url: 'https://user:pass@cdn.example.com/photo.jpg',
            w: '400',
            h: '300',
          }),
        );

        expect(response.status).toBe(400);
      });
    });

    describe('When the source image returns a redirect', () => {
      it('Then returns 502 with redirect error', async () => {
        globalThis.fetch = mock(() =>
          Promise.resolve(
            new Response(null, {
              status: 301,
              headers: { Location: 'https://evil.com/hack.jpg' },
            }),
          ),
        );

        const response = await handler(
          makeRequest({
            url: 'https://cdn.example.com/photo.jpg',
            w: '400',
            h: '300',
          }),
        );

        expect(response.status).toBe(502);
        const body = (await response.json()) as { error: string };
        expect(body.error).toContain('redirect');
      });
    });

    describe('When the source image returns 404', () => {
      it('Then returns 404 with JSON error body', async () => {
        globalThis.fetch = mockFetchResponse({ status: 404, contentType: 'text/html' });

        const response = await handler(
          makeRequest({
            url: 'https://cdn.example.com/missing.jpg',
            w: '400',
            h: '300',
          }),
        );

        expect(response.status).toBe(404);
      });
    });

    describe('When the source URL returns non-image Content-Type', () => {
      it('Then returns 502 with not an image error', async () => {
        globalThis.fetch = mockFetchResponse({ contentType: 'text/html' });

        const response = await handler(
          makeRequest({
            url: 'https://cdn.example.com/page.html',
            w: '400',
            h: '300',
          }),
        );

        expect(response.status).toBe(502);
        const body = (await response.json()) as { error: string };
        expect(body.error).toContain('image');
      });
    });

    describe('When width exceeds maxWidth', () => {
      const handlerWithLimits = imageOptimizer({
        allowedDomains: ['cdn.example.com'],
        maxWidth: 1920,
      });

      it('Then clamps width to maxWidth', async () => {
        const fetchMock = mockFetchResponse({ headers: { 'cf-resized': 'true' } });
        globalThis.fetch = fetchMock;

        await handlerWithLimits(
          makeRequest({
            url: 'https://cdn.example.com/photo.jpg',
            w: '5000',
            h: '300',
          }),
        );

        const [, fetchInit] = fetchMock.mock.calls[0] as [string, RequestInit];
        const cf = (fetchInit as Record<string, unknown>).cf as {
          image: Record<string, unknown>;
        };
        expect(cf.image.width).toBe(1920);
      });
    });

    describe('When height exceeds maxHeight', () => {
      const handlerWithLimits = imageOptimizer({
        allowedDomains: ['cdn.example.com'],
        maxHeight: 1080,
      });

      it('Then clamps height to maxHeight', async () => {
        const fetchMock = mockFetchResponse({ headers: { 'cf-resized': 'true' } });
        globalThis.fetch = fetchMock;

        await handlerWithLimits(
          makeRequest({
            url: 'https://cdn.example.com/photo.jpg',
            w: '400',
            h: '5000',
          }),
        );

        const [, fetchInit] = fetchMock.mock.calls[0] as [string, RequestInit];
        const cf = (fetchInit as Record<string, unknown>).cf as {
          image: Record<string, unknown>;
        };
        expect(cf.image.height).toBe(1080);
      });
    });

    describe('When request uses redirect: manual', () => {
      it('Then the fetch is called with redirect: manual', async () => {
        const fetchMock = mockFetchResponse({ headers: { 'cf-resized': 'true' } });
        globalThis.fetch = fetchMock;

        await handler(
          makeRequest({
            url: 'https://cdn.example.com/photo.jpg',
            w: '400',
            h: '300',
          }),
        );

        const [, fetchInit] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(fetchInit.redirect).toBe('manual');
      });
    });
  });
});
