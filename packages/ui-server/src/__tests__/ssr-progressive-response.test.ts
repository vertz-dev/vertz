import { afterEach, describe, expect, it, spyOn } from '@vertz/test';
import { buildProgressiveResponse } from '../ssr-progressive-response';
import { collectStreamChunks } from '../streaming';

/** Helper: create a simple ReadableStream from an array of strings. */
function stringStream(...parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.close();
    },
  });
}

/** Helper: create a ReadableStream that errors after emitting some chunks. */
function errorStream(parts: string[], errorMessage: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.error(new Error(errorMessage));
    },
  });
}

describe('buildProgressiveResponse', () => {
  describe('Given head, render stream, and tail chunks', () => {
    it('first readable chunk is the head', async () => {
      const response = buildProgressiveResponse({
        headChunk: '<html><head></head><body><div id="app">',
        renderStream: stringStream('<h1>Hello</h1>'),
        tailChunk: '</div></body></html>',
        ssrData: [],
      });

      const chunks = await collectStreamChunks(response.body!);
      expect(chunks[0]).toBe('<html><head></head><body><div id="app">');
    });

    it('middle chunks come from the render stream', async () => {
      const response = buildProgressiveResponse({
        headChunk: '<head>',
        renderStream: stringStream('<p>one</p>', '<p>two</p>'),
        tailChunk: '</body>',
        ssrData: [],
      });

      const chunks = await collectStreamChunks(response.body!);
      expect(chunks[1]).toBe('<p>one</p>');
      expect(chunks[2]).toBe('<p>two</p>');
    });

    it('final chunk is the tail with SSR data', async () => {
      const response = buildProgressiveResponse({
        headChunk: '<head>',
        renderStream: stringStream('<p>content</p>'),
        tailChunk: '</div></body></html>',
        ssrData: [{ key: 'tasks', data: [1, 2, 3] }],
      });

      const chunks = await collectStreamChunks(response.body!);
      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk).toContain('__VERTZ_SSR_DATA__');
      expect(lastChunk).toContain('</div></body></html>');
    });

    it('the stream is closed after the tail', async () => {
      const response = buildProgressiveResponse({
        headChunk: '<head>',
        renderStream: stringStream('<p>done</p>'),
        tailChunk: '</body>',
        ssrData: [],
      });

      const chunks = await collectStreamChunks(response.body!);
      // collectStreamChunks reads until done — if we got here, stream is closed
      expect(chunks.length).toBeGreaterThanOrEqual(2); // head + at least tail
    });
  });

  describe('Given empty SSR data', () => {
    it('tail chunk does not include SSR data script', async () => {
      const response = buildProgressiveResponse({
        headChunk: '<head>',
        renderStream: stringStream('<p>hi</p>'),
        tailChunk: '</body></html>',
        ssrData: [],
      });

      const chunks = await collectStreamChunks(response.body!);
      const allHtml = chunks.join('');
      expect(allHtml).not.toContain('__VERTZ_SSR_DATA__');
    });
  });

  describe('Given a render stream that errors mid-way', () => {
    it('emits an error script chunk', async () => {
      const response = buildProgressiveResponse({
        headChunk: '<head>',
        renderStream: errorStream(['<p>partial</p>'], 'render boom'),
        tailChunk: '</body></html>',
        ssrData: [],
      });

      const chunks = await collectStreamChunks(response.body!);
      const allHtml = chunks.join('');
      expect(allHtml).toContain('vertz:ssr-error');
    });

    it('the tail chunk is still sent (valid HTML structure)', async () => {
      const response = buildProgressiveResponse({
        headChunk: '<head>',
        renderStream: errorStream(['<p>partial</p>'], 'render boom'),
        tailChunk: '</body></html>',
        ssrData: [],
      });

      const chunks = await collectStreamChunks(response.body!);
      const allHtml = chunks.join('');
      expect(allHtml).toContain('</body></html>');
    });

    it('the stream is closed after the error', async () => {
      const response = buildProgressiveResponse({
        headChunk: '<head>',
        renderStream: errorStream([], 'early error'),
        tailChunk: '</body>',
        ssrData: [],
      });

      // Should not hang — collectStreamChunks reads to completion
      const chunks = await collectStreamChunks(response.body!);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('escapes error messages containing HTML to prevent XSS', async () => {
      const response = buildProgressiveResponse({
        headChunk: '<head>',
        renderStream: errorStream([], '</script><img onerror="alert(1)">'),
        tailChunk: '</body>',
        ssrData: [],
      });

      const chunks = await collectStreamChunks(response.body!);
      const allHtml = chunks.join('');
      // The raw </script> injection must not appear
      expect(allHtml).not.toContain('</script><img');
      // Should be escaped via safeSerialize
      expect(allHtml).toContain('\\u003c');
    });

    it('logs the error to the server console', async () => {
      const spy = spyOn(console, 'error').mockImplementation(() => {});

      const response = buildProgressiveResponse({
        headChunk: '<head>',
        renderStream: errorStream([], 'stream failure'),
        tailChunk: '</body>',
        ssrData: [],
      });

      await collectStreamChunks(response.body!);

      expect(spy).toHaveBeenCalledWith('[SSR] Render error after head sent:', 'stream failure');
      spy.mockRestore();
    });
  });

  describe('Given a nonce option', () => {
    it('SSR data script includes the nonce attribute', async () => {
      const response = buildProgressiveResponse({
        headChunk: '<head>',
        renderStream: stringStream('<p>content</p>'),
        tailChunk: '</body>',
        ssrData: [{ key: 'k', data: 'v' }],
        nonce: 'abc123',
      });

      const chunks = await collectStreamChunks(response.body!);
      const allHtml = chunks.join('');
      expect(allHtml).toContain('nonce="abc123"');
    });

    it('error script includes the nonce attribute', async () => {
      const response = buildProgressiveResponse({
        headChunk: '<head>',
        renderStream: errorStream([], 'boom'),
        tailChunk: '</body>',
        ssrData: [],
        nonce: 'xyz',
      });

      const chunks = await collectStreamChunks(response.body!);
      const allHtml = chunks.join('');
      expect(allHtml).toContain('nonce="xyz"');
    });
  });

  describe('Given response headers', () => {
    it('sets Content-Type to text/html', () => {
      const response = buildProgressiveResponse({
        headChunk: '<head>',
        renderStream: stringStream(''),
        tailChunk: '</body>',
        ssrData: [],
      });

      expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    });

    it('includes custom headers when provided', () => {
      const response = buildProgressiveResponse({
        headChunk: '<head>',
        renderStream: stringStream(''),
        tailChunk: '</body>',
        ssrData: [],
        headers: { Link: '<font.woff2>; rel=preload; as=font' },
      });

      expect(response.headers.get('Link')).toBe('<font.woff2>; rel=preload; as=font');
    });
  });
});
