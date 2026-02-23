/**
 * Minimal DOM shim for SSR.
 *
 * Provides document.createElement, .createTextNode, .appendChild, etc.
 * that produce VNode-compatible objects. This allows existing @vertz/ui
 * components to work in SSR without modification.
 *
 * IMPORTANT: This must be imported before any component code.
 */

import type { VNode } from '../types';
import { SSRElement } from './ssr-element';
import { SSRDocumentFragment } from './ssr-fragment';
import { SSRNode } from './ssr-node';
import { SSRTextNode } from './ssr-text-node';

export { SSRNode, SSRElement, SSRTextNode, SSRDocumentFragment };

/**
 * Create and install the DOM shim.
 *
 * If a vertz SSR document is already installed (from a prior call), it is
 * reused so that CSS injected by `css()` during module loading is preserved.
 * Only the `window.location` is refreshed.
 */
export function installDomShim(): void {
  // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
  const existingDoc = typeof document !== 'undefined' ? (globalThis as any).document : null;

  // If the existing document is our own SSR shim, reuse it — CSS may have
  // been injected into head.children by injectCSS() during module loading.
  if (existingDoc?.__vertz_ssr__) {
    // Still need to refresh window.location for the current request URL
    ensureWindow();
    ensureDOMConstructors();
    return;
  }

  // If a real browser document exists, don't override it
  if (typeof document !== 'undefined') {
    return;
  }

  // Install fresh SSR document
  // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
  (globalThis as any).document = createSSRDocument();

  ensureWindow();
  ensureDOMConstructors();
}

/**
 * Create a fresh SSR document shim marked with `__vertz_ssr__`.
 */
function createSSRDocument() {
  return {
    __vertz_ssr__: true,
    createElement(tag: string): SSRElement {
      return new SSRElement(tag);
    },
    createTextNode(text: string): SSRTextNode {
      return new SSRTextNode(text);
    },
    createComment(_text: string): SSRTextNode {
      // Comments serve as conditional branch placeholders — invisible during SSR
      const node = new SSRTextNode('');
      // Override nodeType to match browser Comment.COMMENT_NODE
      Object.defineProperty(node, 'nodeType', { value: SSRNode.COMMENT_NODE });
      return node;
    },
    createDocumentFragment(): SSRDocumentFragment {
      return new SSRDocumentFragment();
    },
    // Stub for document properties that may be accessed
    head: new SSRElement('head'),
    body: new SSRElement('body'),
    // Note: do NOT include startViewTransition — code checks 'in' operator
  };
}

/**
 * Ensure `window` is shimmed with the current SSR URL.
 */
function ensureWindow(): void {
  if (typeof window === 'undefined') {
    // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
    (globalThis as any).window = {
      location: { pathname: globalThis.__SSR_URL__ || '/' },
      addEventListener: () => {},
      removeEventListener: () => {},
      history: {
        pushState: () => {},
        replaceState: () => {},
      },
    };
  } else {
    // Update window.location.pathname for the current request URL
    // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
    (globalThis as any).window.location = {
      // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
      ...((globalThis as any).window.location || {}),
      pathname: globalThis.__SSR_URL__ || '/',
    };
  }
}

/**
 * Ensure global DOM constructors are available for `instanceof` checks.
 */
function ensureDOMConstructors(): void {
  // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
  (globalThis as any).Node = SSRNode;
  // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
  (globalThis as any).HTMLElement = SSRElement;
  // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
  (globalThis as any).HTMLAnchorElement = SSRElement;
  // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
  (globalThis as any).HTMLDivElement = SSRElement;
  // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
  (globalThis as any).HTMLInputElement = SSRElement;
  // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
  (globalThis as any).HTMLButtonElement = SSRElement;
  // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
  (globalThis as any).HTMLSelectElement = SSRElement;
  // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
  (globalThis as any).HTMLTextAreaElement = SSRElement;
  // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
  (globalThis as any).DocumentFragment = SSRDocumentFragment;
  // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
  (globalThis as any).MouseEvent = class MockMouseEvent {};
  // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
  (globalThis as any).Event = class MockEvent {};
}

/**
 * Remove the DOM shim.
 *
 * Resets `document` to a fresh empty shim instead of deleting it.
 * This prevents ReferenceErrors from async callbacks (e.g., query() fetch
 * Promises) that resolve after SSR render cleanup — those callbacks harmlessly
 * create orphan SSR nodes on the fresh document that get garbage collected.
 *
 * DOM constructors (Node, HTMLElement, etc.) are kept installed permanently.
 */
export function removeDomShim(): void {
  // Reset document to a fresh empty shim — async callbacks that fire after
  // cleanup will create orphan SSR nodes that go nowhere (no crash).
  // The __vertz_ssr__ marker ensures installDomShim() recognizes it as our shim.
  // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
  (globalThis as any).document = createSSRDocument();

  // Remove window — it's only needed during active SSR render for router/location
  if (typeof window !== 'undefined') {
    // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
    delete (globalThis as any).window;
  }
}

/**
 * Convert an SSRElement to a VNode
 */
// biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
export function toVNode(element: any): VNode {
  if (element instanceof SSRElement) {
    return element.toVNode();
  }
  if (element instanceof SSRDocumentFragment) {
    return {
      tag: 'fragment',
      attrs: {},
      children: element.children.map((child) => {
        if (typeof child === 'string') return child;
        return child.toVNode();
      }),
    };
  }
  // Already a VNode
  if (typeof element === 'object' && 'tag' in element) {
    return element as VNode;
  }
  return { tag: 'span', attrs: {}, children: [String(element)] };
}
