import { describe, expect, it } from 'vitest';
import { collectStreamChunks, encodeChunk, streamToString } from '../streaming';

describe('encodeChunk', () => {
  it('encodes a string to Uint8Array', () => {
    const result = encodeChunk('<div>hello</div>');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(result)).toBe('<div>hello</div>');
  });

  it('handles empty string', () => {
    const result = encodeChunk('');
    expect(new TextDecoder().decode(result)).toBe('');
  });

  it('handles unicode content', () => {
    const result = encodeChunk('<p>Caf\u00e9 \u2603</p>');
    expect(new TextDecoder().decode(result)).toBe('<p>Caf\u00e9 \u2603</p>');
  });
});

describe('streamToString', () => {
  it('converts a ReadableStream to a string', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('<div>'));
        controller.enqueue(new TextEncoder().encode('hello'));
        controller.enqueue(new TextEncoder().encode('</div>'));
        controller.close();
      },
    });
    const result = await streamToString(stream);
    expect(result).toBe('<div>hello</div>');
  });

  it('handles empty stream', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    const result = await streamToString(stream);
    expect(result).toBe('');
  });
});

describe('collectStreamChunks', () => {
  it('collects all chunks as strings', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('chunk1'));
        controller.enqueue(new TextEncoder().encode('chunk2'));
        controller.enqueue(new TextEncoder().encode('chunk3'));
        controller.close();
      },
    });
    const chunks = await collectStreamChunks(stream);
    expect(chunks).toEqual(['chunk1', 'chunk2', 'chunk3']);
  });

  it('returns empty array for empty stream', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    const chunks = await collectStreamChunks(stream);
    expect(chunks).toEqual([]);
  });
});
