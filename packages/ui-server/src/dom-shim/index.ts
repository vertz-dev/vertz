/**
 * Minimal DOM shim for SSR.
 *
 * Provides document.createElement, .createTextNode, .appendChild, etc.
 * that produce VNode-compatible objects. This allows existing @vertz/ui
 * components to work in SSR without modification.
 *
 * IMPORTANT: This must be imported before any component code.
 */

import { setAdapter } from '@vertz/ui/internals';
import { createSSRAdapter } from '../ssr-adapter';
import type { VNode } from '../types';
import { SSRComment } from './ssr-comment';
import { SSRElement } from './ssr-element';
import { SSRDocumentFragment } from './ssr-fragment';
import { SSRNode } from './ssr-node';
import { SSRTextNode } from './ssr-text-node';

export { SSRNode, SSRElement, SSRTextNode, SSRComment, SSRDocumentFragment };

/** Saved globals from before installDomShim(), restored by removeDomShim(). */
const SHIM_GLOBALS = [
  'document',
  'window',
  'Node',
  'HTMLElement',
  'HTMLAnchorElement',
  'HTMLDivElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLSelectElement',
  'HTMLTextAreaElement',
  'DocumentFragment',
  'MouseEvent',
  'Event',
] as const;
let savedGlobals: Map<string, unknown> | null = null;
let shimInstalled = false;

/**
 * Create and install the DOM shim.
 *
 * @deprecated Use `setAdapter(createSSRAdapter())` instead.
 * This function is kept for backward compatibility — it installs the
 * SSR adapter and the global DOM shim. New code should use the adapter
 * directly via `setAdapter()`.
 */
export function installDomShim(): void {
  // Also install the SSR adapter for backward compat
  setAdapter(createSSRAdapter());

  // In a real browser, the document will have a proper doctype and won't be Happy-DOM
  // Check for Happy-DOM or other test environments by looking for __SSR_URL__ global
  // If __SSR_URL__ is set, we ALWAYS want to install our shim, even if document exists
  const isSSRContext = typeof globalThis.__SSR_URL__ !== 'undefined';

  if (typeof document !== 'undefined' && !isSSRContext) {
    shimInstalled = false;
    return; // Already in a real browser, don't override
  }

  shimInstalled = true;

  // Save existing globals so removeDomShim() can restore them
  // (prevents wiping happydom or other DOM environments in single-process test runners)
  savedGlobals = new Map();
  for (const g of SHIM_GLOBALS) {
    if (g in globalThis) {
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
      savedGlobals.set(g, (globalThis as any)[g]);
    }
  }

  const fakeDocument = {
    createElement(tag: string): SSRElement {
      return new SSRElement(tag);
    },
    createTextNode(text: string): SSRTextNode {
      return new SSRTextNode(text);
    },
    createComment(text: string): SSRComment {
      return new SSRComment(text);
    },
    createDocumentFragment(): SSRDocumentFragment {
      return new SSRDocumentFragment();
    },
    // Stub for document properties that may be accessed
    head: new SSRElement('head'),
    body: new SSRElement('body'),
    // Note: do NOT include startViewTransition — code checks 'in' operator
  };

  // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
  (globalThis as any).document = fakeDocument;

  // Provide a minimal window shim if not present
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
    // CRITICAL FIX: Update window.location.pathname even if window already exists
    // This handles module caching where router.ts was already loaded but we're
    // rendering a different URL
    // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
    (globalThis as any).window.location = {
      // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
      ...((globalThis as any).window.location || {}),
      pathname: globalThis.__SSR_URL__ || '/',
    };
  }

  // Provide global DOM constructors for instanceof checks
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
 * @deprecated Use `setAdapter(null)` instead.
 * This function is kept for backward compatibility.
 *
 * If globals existed before installDomShim() (e.g., happydom in a test runner),
 * they are restored instead of deleted. This prevents contamination in
 * single-process test runners like `bun test`.
 */
export function removeDomShim(): void {
  // Reset the adapter to auto-detect (DOMAdapter)
  setAdapter(null);

  // If the shim was never installed (e.g., a real DOM or happydom was already
  // present), don't touch the globals — we didn't put them there.
  if (!shimInstalled) {
    return;
  }
  shimInstalled = false;

  if (savedGlobals) {
    // Restore globals that existed before install
    for (const g of SHIM_GLOBALS) {
      if (savedGlobals.has(g)) {
        // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
        (globalThis as any)[g] = savedGlobals.get(g);
      } else {
        // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
        delete (globalThis as any)[g];
      }
    }
    savedGlobals = null;
  } else {
    for (const g of SHIM_GLOBALS) {
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
      delete (globalThis as any)[g];
    }
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
