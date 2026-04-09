import { afterEach, describe, expect, it, mock } from '@vertz/test';
import { loadImage } from '../image';

describe('loadImage', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('loads an SVG string and returns a data URI', async () => {
    const svg = '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="red"/></svg>';
    const result = await loadImage(svg);
    expect(result).toStartWith('data:image/svg+xml,');
    expect(result).toContain(encodeURIComponent('<svg'));
  });

  it('handles SVG string with leading whitespace', async () => {
    const svg = '  \n  <svg viewBox="0 0 10 10"><rect fill="blue"/></svg>';
    const result = await loadImage(svg);
    expect(result).toStartWith('data:image/svg+xml,');
  });

  it('loads a file path and returns a base64 data URI', async () => {
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52,
    ]);
    const tmpPath = `/tmp/test-og-image-${Date.now()}.png`;
    await Bun.write(tmpPath, pngBytes);

    const result = await loadImage(tmpPath);
    expect(result).toStartWith('data:image/png;base64,');

    const { unlinkSync } = await import('node:fs');
    unlinkSync(tmpPath);
  });

  it('loads a URL and returns a base64 data URI', async () => {
    const fakeImageData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    globalThis.fetch = mock(async () => {
      return new Response(fakeImageData, {
        headers: { 'Content-Type': 'image/png' },
      });
    }) as typeof fetch;

    const result = await loadImage('https://example.com/image.png');
    expect(result).toStartWith('data:image/png;base64,');
  });

  it('falls back to application/octet-stream when URL has no Content-Type', async () => {
    const fakeData = new Uint8Array([0x00, 0x01]);
    globalThis.fetch = mock(async () => {
      return new Response(fakeData);
    }) as typeof fetch;

    const result = await loadImage('https://example.com/file.bin');
    expect(result).toStartWith('data:application/octet-stream;base64,');
  });

  it('detects MIME type from file extension', async () => {
    const tmpPath = `/tmp/test-og-image-${Date.now()}.jpg`;
    await Bun.write(tmpPath, new Uint8Array([0xff, 0xd8, 0xff]));

    const result = await loadImage(tmpPath);
    expect(result).toStartWith('data:image/jpeg;base64,');

    const { unlinkSync } = await import('node:fs');
    unlinkSync(tmpPath);
  });

  it('throws when file does not exist', async () => {
    await expect(loadImage('/tmp/nonexistent-og-file-12345.png')).rejects.toThrow();
  });

  it('throws on HTTP error from URL fetch', async () => {
    globalThis.fetch = mock(async () => {
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch;

    await expect(loadImage('https://example.com/missing.png')).rejects.toThrow('HTTP 404');
  });
});
