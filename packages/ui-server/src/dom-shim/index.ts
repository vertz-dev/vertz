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
import { SSRNode } from './ssr-node';
import { SSRElement } from './ssr-element';
import { SSRTextNode } from './ssr-text-node';
import { SSRDocumentFragment } from './ssr-fragment';

export { SSRNode, SSRElement, SSRTextNode, SSRDocumentFragment };

/**
 * Create and install the DOM shim
 */
export function installDomShim(): void {
  // In a real browser, the document will have a proper doctype and won't be Happy-DOM
  // Check for Happy-DOM or other test environments by looking for __SSR_URL__ global
  // If __SSR_URL__ is set, we ALWAYS want to install our shim, even if document exists
  const isSSRContext = typeof (globalThis as any).__SSR_URL__ !== 'undefined';
  
  if (typeof document !== 'undefined' && !isSSRContext) {
    return; // Already in a real browser, don't override
  }
  
  const fakeDocument = {
    createElement(tag: string): SSRElement {
      return new SSRElement(tag);
    },
    createTextNode(text: string): SSRTextNode {
      return new SSRTextNode(text);
    },
    createComment(text: string): SSRTextNode {
      // Comments are rendered as text nodes in SSR (they're stripped anyway)
      return new SSRTextNode(`<!-- ${text} -->`);
    },
    createDocumentFragment(): SSRDocumentFragment {
      return new SSRDocumentFragment();
    },
    // Stub for document properties that may be accessed
    head: new SSRElement('head'),
    body: new SSRElement('body'),
    // Note: do NOT include startViewTransition — code checks 'in' operator
  };
  
  (globalThis as any).document = fakeDocument;
  
  // Provide a minimal window shim if not present
  if (typeof window === 'undefined') {
    (globalThis as any).window = {
      location: { pathname: (globalThis as any).__SSR_URL__ || '/' },
      addEventListener: () => {},
      removeEventListener: () => {},
      history: {
        pushState: () => {},
        replaceState: () => {},
      },
    };
  } else {
    // CRITICAL FIX: Update window.location.pathname even if window already exists
    // This handles module caching where router.ts was already loaded but we're
    // rendering a different URL
    (globalThis as any).window.location = {
      ...((globalThis as any).window.location || {}),
      pathname: (globalThis as any).__SSR_URL__ || '/',
    };
  }
  
  // Provide global DOM constructors for instanceof checks
  (globalThis as any).Node = SSRNode;
  (globalThis as any).HTMLElement = SSRElement;
  (globalThis as any).HTMLAnchorElement = SSRElement;
  (globalThis as any).HTMLDivElement = SSRElement;
  (globalThis as any).HTMLInputElement = SSRElement;
  (globalThis as any).HTMLButtonElement = SSRElement;
  (globalThis as any).HTMLSelectElement = SSRElement;
  (globalThis as any).HTMLTextAreaElement = SSRElement;
  (globalThis as any).DocumentFragment = SSRDocumentFragment;
  (globalThis as any).MouseEvent = class MockMouseEvent {};
  (globalThis as any).Event = class MockEvent {};
}

/**
 * Remove the DOM shim
 */
export function removeDomShim(): void {
  const globals = [
    'document', 'window', 'Node', 'HTMLElement', 'HTMLAnchorElement', 'HTMLDivElement',
    'HTMLInputElement', 'HTMLButtonElement', 'HTMLSelectElement', 'HTMLTextAreaElement',
    'DocumentFragment', 'MouseEvent', 'Event',
  ];
  for (const g of globals) {
    delete (globalThis as any)[g];
  }
}

/**
 * Convert an SSRElement to a VNode
 */
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
