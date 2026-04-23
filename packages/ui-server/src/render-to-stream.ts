import {
  escapeAttr,
  escapeHtml,
  isRawHtml,
  RAW_TEXT_ELEMENTS,
  VOID_ELEMENTS,
} from './html-serializer';
import { encodeChunk } from './streaming';
import type { RawHtml, VNode } from './types';

/**
 * Render a VNode tree to a `ReadableStream` of HTML chunks.
 *
 * This is the main SSR entry point. It walks the virtual tree and serializes
 * the full HTML synchronously into a single stream chunk.
 */
export function renderToStream(tree: VNode | string | RawHtml): ReadableStream<Uint8Array> {
  function walkAndSerialize(node: VNode | string | RawHtml): string {
    if (typeof node === 'string') {
      return escapeHtml(node);
    }

    if (isRawHtml(node)) {
      return node.html;
    }

    const { tag, attrs, children } = node;

    if (tag === 'fragment') {
      return children.map((child) => walkAndSerialize(child)).join('');
    }

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
    start(controller) {
      controller.enqueue(encodeChunk(walkAndSerialize(tree)));
      controller.close();
    },
  });
}
