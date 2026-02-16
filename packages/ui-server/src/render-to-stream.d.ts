import type { RawHtml, RenderToStreamOptions, VNode } from './types';
/**
 * Render a VNode tree to a `ReadableStream` of HTML chunks.
 *
 * This is the main SSR entry point. It walks the virtual tree, serializing
 * synchronous content immediately and deferring Suspense boundaries.
 *
 * Suspense boundaries emit:
 * 1. A `<div id="v-slot-N">fallback</div>` placeholder inline
 * 2. A `<template id="v-tmpl-N">resolved</template><script>...</script>` chunk
 *    appended after the main content once the async content resolves
 *
 * This enables out-of-order streaming: the browser can paint the fallback
 * immediately and swap in the resolved content when it arrives.
 */
export declare function renderToStream(
  tree: VNode | string | RawHtml,
  options?: RenderToStreamOptions,
): ReadableStream<Uint8Array>;
//# sourceMappingURL=render-to-stream.d.ts.map
