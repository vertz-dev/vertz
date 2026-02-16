/**
 * Encode a string as a UTF-8 Uint8Array chunk.
 */
export declare function encodeChunk(html: string): Uint8Array;
/**
 * Convert a ReadableStream of Uint8Array chunks to a single string.
 * Useful for testing SSR output.
 */
export declare function streamToString(stream: ReadableStream<Uint8Array>): Promise<string>;
/**
 * Collect all chunks from a ReadableStream as an array of strings.
 * Useful for testing streaming behavior (chunk ordering, etc.).
 */
export declare function collectStreamChunks(stream: ReadableStream<Uint8Array>): Promise<string[]>;
//# sourceMappingURL=streaming.d.ts.map
