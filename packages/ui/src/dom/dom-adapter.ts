import type { RenderAdapter, RenderNode } from './adapter';

/**
 * Create a DOM adapter that delegates to real browser DOM APIs.
 * Zero overhead — no branding, no wrapping.
 * Browser `Node` instances pass `isRenderNode()` via the `instanceof Node` fallback.
 */
export function createDOMAdapter(): RenderAdapter {
  return {
    createElement: (tag) => document.createElement(tag),
    createTextNode: (text) => document.createTextNode(text),
    createComment: (text) => document.createComment(text),
    createDocumentFragment: () => document.createDocumentFragment(),
    isNode: (value): value is RenderNode => typeof Node !== 'undefined' && value instanceof Node,
  };
}
