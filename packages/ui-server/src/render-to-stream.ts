import {
  escapeAttr,
  escapeHtml,
  isRawHtml,
  RAW_TEXT_ELEMENTS,
  serializeToHtml,
  VOID_ELEMENTS,
} from './html-serializer';
import { createSlotPlaceholder } from './slot-placeholder';
import { encodeChunk } from './streaming';
import { createTemplateChunk } from './template-chunk';
import type { RawHtml, VNode } from './types';

/**
 * Internal interface for suspense VNodes with async resolution.
 * A `__suspense` tag signals a Suspense boundary in the virtual tree.
 */
interface SuspenseVNode extends VNode {
  tag: '__suspense';
  _fallback: VNode | string;
  _resolve: Promise<VNode | string>;
}

/** Type guard for suspense nodes. */
function isSuspenseNode(node: VNode | string | RawHtml): node is SuspenseVNode {
  return (
    typeof node === 'object' && 'tag' in node && node.tag === '__suspense' && '_resolve' in node
  );
}

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
export function renderToStream(tree: VNode | string | RawHtml): ReadableStream<Uint8Array> {
  // Collect pending suspense boundaries
  const pendingBoundaries: Array<{
    slotId: number;
    resolve: Promise<VNode | string>;
  }> = [];

  /**
   * Walk the tree and serialize synchronous content.
   * Suspense boundaries are replaced with placeholders and queued for later resolution.
   */
  function walkAndSerialize(node: VNode | string | RawHtml): string {
    if (typeof node === 'string') {
      return escapeHtml(node);
    }

    if (isRawHtml(node)) {
      return node.html;
    }

    if (isSuspenseNode(node)) {
      const placeholder = createSlotPlaceholder(node._fallback);
      pendingBoundaries.push({
        slotId: placeholder._slotId,
        resolve: node._resolve,
      });
      return serializeToHtml(placeholder);
    }

    const { tag, attrs, children } = node;
    const isRawText = RAW_TEXT_ELEMENTS.has(tag);

    const attrStr = Object.entries(attrs)
      .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
      .join('');

    if (VOID_ELEMENTS.has(tag)) {
      return `<${tag}${attrStr}>`;
    }

    const childrenHtml = children
      .map((child) => {
        if (typeof child === 'string' && isRawText) {
          return child; // No escaping for script/style text content
        }
        return walkAndSerialize(child);
      })
      .join('');

    return `<${tag}${attrStr}>${childrenHtml}</${tag}>`;
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      // Phase 1: Emit synchronous content with suspense placeholders
      const mainHtml = walkAndSerialize(tree);
      controller.enqueue(encodeChunk(mainHtml));

      // Phase 2: Resolve all suspense boundaries and emit replacement chunks
      if (pendingBoundaries.length > 0) {
        const resolutions = pendingBoundaries.map(async (boundary) => {
          try {
            const resolved = await boundary.resolve;
            const resolvedHtml = serializeToHtml(resolved);
            return createTemplateChunk(boundary.slotId, resolvedHtml);
          } catch (_err: unknown) {
            // Emit an error placeholder so the stream stays alive
            const errorHtml =
              `<div data-v-ssr-error="true" id="v-ssr-error-${boundary.slotId}">` +
              '<!--SSR error--></div>';
            return createTemplateChunk(boundary.slotId, errorHtml);
          }
        });

        const chunks = await Promise.all(resolutions);
        for (const chunk of chunks) {
          controller.enqueue(encodeChunk(chunk));
        }
      }

      controller.close();
    },
  });
}
