import { afterEach, describe, expect, it, mock } from 'bun:test';
import { loadGoogleFont } from '../fonts';

describe('loadGoogleFont', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches a Google Font and returns ArrayBuffer', async () => {
    const fakeFont = new ArrayBuffer(16);
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('fonts.googleapis.com')) {
        return new Response('src: url(https://fonts.example.com/font.ttf) format("truetype");');
      }
      return new Response(fakeFont);
    }) as typeof fetch;

    const result = await loadGoogleFont('Inter', 400);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBe(16);
  });

  it('uses Googlebot User-Agent to get TTF format', async () => {
    let capturedHeaders: Headers | undefined;
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('fonts.googleapis.com')) {
        capturedHeaders = new Headers(init?.headers);
        return new Response('src: url(https://fonts.example.com/font.ttf) format("truetype");');
      }
      return new Response(new ArrayBuffer(8));
    }) as typeof fetch;

    await loadGoogleFont('Inter', 400);
    expect(capturedHeaders?.get('User-Agent')).toContain('Googlebot');
  });

  it('throws when font URL cannot be extracted from CSS', async () => {
    globalThis.fetch = mock(async () => {
      return new Response('/* no font URLs here */');
    }) as typeof fetch;

    await expect(loadGoogleFont('NonExistentFont', 400)).rejects.toThrow(
      'Could not extract font URL for NonExistentFont:400',
    );
  });

  it('defaults weight to 400 when not specified', async () => {
    let capturedUrl = '';
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('fonts.googleapis.com')) {
        capturedUrl = url;
        return new Response('src: url(https://fonts.example.com/font.ttf) format("truetype");');
      }
      return new Response(new ArrayBuffer(8));
    }) as typeof fetch;

    await loadGoogleFont('Inter');
    expect(decodeURIComponent(capturedUrl)).toContain('wght@400');
  });
});
