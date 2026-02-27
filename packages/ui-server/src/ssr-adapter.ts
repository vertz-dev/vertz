import type { RenderAdapter, RenderNode } from '@vertz/ui/internals';
import { SSRComment } from './dom-shim/ssr-comment';
import { SSRElement } from './dom-shim/ssr-element';
import { SSRDocumentFragment } from './dom-shim/ssr-fragment';
import { SSRNode } from './dom-shim/ssr-node';
import { SSRTextNode } from './dom-shim/ssr-text-node';

/** The brand symbol — must match RENDER_NODE_BRAND from @vertz/ui */
const BRAND = Symbol.for('vertz:render-node');

// Install the brand on SSRNode prototype so all SSR nodes are recognized
// by isRenderNode(). This is done once at module load time.
Object.defineProperty(SSRNode.prototype, BRAND, {
  value: true,
  enumerable: false,
  configurable: false,
  writable: false,
});

/**
 * Create an SSR adapter that uses in-memory SSR node classes.
 * Replaces `installDomShim()` — no global mutation needed.
 */
export function createSSRAdapter(): RenderAdapter {
  return {
    createElement: (tag) => new SSRElement(tag),
    createElementNS: (_ns, tag) => new SSRElement(tag),
    createTextNode: (text) => new SSRTextNode(text),
    createComment: (text) => new SSRComment(text),
    createDocumentFragment: () => new SSRDocumentFragment(),
    isNode: (value): value is RenderNode =>
      value != null && typeof value === 'object' && BRAND in value,
  };
}
