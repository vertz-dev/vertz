/**
 * Progressive HTML streaming response builder.
 *
 * Assembles a ReadableStream<Uint8Array> from pre-computed head + render stream + tail.
 * The head chunk is sent immediately, app HTML chunks are piped through from the
 * render stream, and the tail chunk (with SSR data) is sent after the render completes.
 *
 * This is an internal module used by ssr-handler.ts — not part of the public API.
 */

import { escapeAttr } from './html-serializer';
import { safeSerialize } from './ssr-streaming-runtime';
import { encodeChunk } from './streaming';

export interface ProgressiveResponseOptions {
  /** Pre-computed head HTML (doctype through opening app div). */
  headChunk: string;
  /** Render stream producing app HTML chunks. */
  renderStream: ReadableStream<Uint8Array>;
  /** Pre-computed tail HTML (closing app div through </html>). */
  tailChunk: string;
  /** SSR data entries for client hydration. */
  ssrData: Array<{ key: string; data: unknown }>;
  /** CSP nonce for inline scripts. */
  nonce?: string;
  /** Additional response headers (e.g., Link for font preloads). */
  headers?: Record<string, string>;
  /** HTTP status code (default: 200). */
  status?: number;
}

/**
 * Build a streaming Response that sends HTML progressively.
 *
 * Chunk order:
 * 1. headChunk (immediate — CSS, preloads, opening tags)
 * 2. renderStream chunks (app HTML as it's rendered)
 * 3. tailChunk (SSR data script, closing tags)
 */
export function buildProgressiveResponse(options: ProgressiveResponseOptions): Response {
  const { headChunk, renderStream, tailChunk, ssrData, nonce, headers } = options;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 1. Send head immediately
      controller.enqueue(encodeChunk(headChunk));

      // 2. Pipe render stream chunks
      const reader = renderStream.getReader();
      let renderError: Error | undefined;

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch (err) {
        renderError = err instanceof Error ? err : new Error(String(err));
      }

      // 3. If render errored, log and emit in-band error script
      if (renderError) {
        console.error('[SSR] Render error after head sent:', renderError.message);
        const nonceAttr = nonce != null ? ` nonce="${escapeAttr(nonce)}"` : '';
        const errorScript =
          `<script${nonceAttr}>document.dispatchEvent(new CustomEvent('vertz:ssr-error',` +
          `{detail:{message:${safeSerialize(renderError.message)}}}))</script>`;
        controller.enqueue(encodeChunk(errorScript));
      }

      // 4. Build and send tail chunk (SSR data + closing tags)
      let tail = '';
      if (ssrData.length > 0) {
        const nonceAttr = nonce != null ? ` nonce="${escapeAttr(nonce)}"` : '';
        tail += `<script${nonceAttr}>window.__VERTZ_SSR_DATA__=${safeSerialize(ssrData)};</script>`;
      }
      tail += tailChunk;
      controller.enqueue(encodeChunk(tail));

      controller.close();
    },
  });

  const responseHeaders: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
    ...headers,
  };

  return new Response(stream, { status: options.status ?? 200, headers: responseHeaders });
}
