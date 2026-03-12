import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { handleDevImageProxy } from '../dev-image-proxy';

describe('handleDevImageProxy', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('proxies the original image and returns it with Content-Type from upstream', async () => {
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    globalThis.fetch = mock().mockResolvedValue(
      new Response(imageBytes, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    ) as typeof fetch;

    const request = new Request(
      'http://localhost:3000/_vertz/image?url=https%3A%2F%2Fcdn.example.com%2Fphoto.png&w=800&h=600',
    );
    const response = await handleDevImageProxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body).toEqual(imageBytes);
  });

  it('sets Cache-Control: no-cache in dev mode', async () => {
    globalThis.fetch = mock().mockResolvedValue(
      new Response('img', {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      }),
    ) as typeof fetch;

    const request = new Request(
      'http://localhost:3000/_vertz/image?url=https%3A%2F%2Fcdn.example.com%2Fphoto.jpg&w=400&h=300',
    );
    const response = await handleDevImageProxy(request);

    expect(response.headers.get('Cache-Control')).toBe('no-cache');
  });

  it('returns 400 when url parameter is missing', async () => {
    const request = new Request('http://localhost:3000/_vertz/image?w=800&h=600');
    const response = await handleDevImageProxy(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('url');
  });

  it('returns 400 for non-HTTP scheme (ftp://)', async () => {
    const request = new Request(
      'http://localhost:3000/_vertz/image?url=ftp%3A%2F%2Ffiles.example.com%2Fimg.png',
    );
    const response = await handleDevImageProxy(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('HTTP');
  });

  it('returns 400 for invalid URL', async () => {
    const request = new Request('http://localhost:3000/_vertz/image?url=not-a-valid-url');
    const response = await handleDevImageProxy(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Invalid');
  });

  it('returns 502 when upstream returns non-200 status', async () => {
    globalThis.fetch = mock().mockResolvedValue(
      new Response('Not Found', { status: 404 }),
    ) as typeof fetch;

    const request = new Request(
      'http://localhost:3000/_vertz/image?url=https%3A%2F%2Fcdn.example.com%2Fmissing.png',
    );
    const response = await handleDevImageProxy(request);

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toContain('404');
  });

  it('returns 504 when upstream fetch times out', async () => {
    globalThis.fetch = mock().mockRejectedValue(
      new DOMException('timeout', 'TimeoutError'),
    ) as typeof fetch;

    const request = new Request(
      'http://localhost:3000/_vertz/image?url=https%3A%2F%2Fcdn.example.com%2Fslow.png',
    );
    const response = await handleDevImageProxy(request);

    expect(response.status).toBe(504);
  });

  it('returns 502 when fetch fails for other reasons', async () => {
    globalThis.fetch = mock().mockRejectedValue(new Error('Network error')) as typeof fetch;

    const request = new Request(
      'http://localhost:3000/_vertz/image?url=https%3A%2F%2Fcdn.example.com%2Fdown.png',
    );
    const response = await handleDevImageProxy(request);

    expect(response.status).toBe(502);
  });
});
