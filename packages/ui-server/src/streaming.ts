const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Encode a string as a UTF-8 Uint8Array chunk.
 */
export function encodeChunk(html: string): Uint8Array {
  return encoder.encode(html);
}

/**
 * Convert a ReadableStream of Uint8Array chunks to a single string.
 * Useful for testing SSR output.
 */
export async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const parts: string[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(decoder.decode(value, { stream: true }));
  }

  // Flush any remaining bytes
  parts.push(decoder.decode());

  return parts.join('');
}

/**
 * Collect all chunks from a ReadableStream as an array of strings.
 * Useful for testing streaming behavior (chunk ordering, etc.).
 */
export async function collectStreamChunks(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = stream.getReader();
  const chunks: string[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value, { stream: true }));
  }

  return chunks;
}
