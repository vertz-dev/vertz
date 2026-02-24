/**
 * SSR streaming runtime — safe serialization and inline script generation
 * for streaming resolved query data to the client.
 */

import { escapeAttr } from './html-serializer';

/**
 * Serialize data to JSON with `<` escaped as `\u003c`.
 * Prevents `</script>` breakout and `<!--` injection in inline scripts.
 */
export function safeSerialize(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/**
 * Generate the inline `<script>` tag that bootstraps the SSR data streaming
 * event bus on the client. Injected into `<head>` during streaming render.
 *
 * Creates:
 * - `window.__VERTZ_SSR_DATA__` — buffered array of received data
 * - `window.__VERTZ_SSR_PUSH__` — function to push data + dispatch event
 */
export function getStreamingRuntimeScript(nonce?: string): string {
  const nonceAttr = nonce != null ? ` nonce="${escapeAttr(nonce)}"` : '';

  return (
    `<script${nonceAttr}>` +
    'window.__VERTZ_SSR_DATA__=[];' +
    'window.__VERTZ_SSR_PUSH__=function(k,d){' +
    'window.__VERTZ_SSR_DATA__.push({key:k,data:d});' +
    'document.dispatchEvent(new CustomEvent("vertz:ssr-data",{detail:{key:k,data:d}}))' +
    '};' +
    '</script>'
  );
}

/**
 * Create an inline `<script>` chunk that pushes resolved query data
 * to the client via `__VERTZ_SSR_PUSH__`.
 *
 * @param key - The query cache key (must match client-side query key)
 * @param data - The resolved query data
 * @param nonce - Optional CSP nonce for the script tag
 */
export function createSSRDataChunk(key: string, data: unknown, nonce?: string): string {
  const nonceAttr = nonce != null ? ` nonce="${escapeAttr(nonce)}"` : '';
  const serialized = safeSerialize(data);

  return `<script${nonceAttr}>window.__VERTZ_SSR_PUSH__(${safeSerialize(key)},${serialized})</script>`;
}
