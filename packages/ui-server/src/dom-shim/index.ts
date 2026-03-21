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
import { ssrStorage } from '../ssr-context';
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

/** Track which additional globals we installed so removeDomShim only cleans up our own. */
let installedGlobals: string[] = [];

/** Install a global only if it doesn't already exist. */
function installGlobal(name: string, value: unknown): void {
  // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
  if ((globalThis as any)[name] === undefined) {
    // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
    });
    installedGlobals.push(name);
  }
}

/**
 * Create and install the DOM shim.
 *
 * @deprecated Use `setAdapter(createSSRAdapter())` instead.
 * This function is kept for backward compatibility — it installs the
 * SSR adapter and the global DOM shim. New code should use the adapter
 * directly via `setAdapter()`.
 */
export function installDomShim(): void {
  // Clean up any previously tracked globals from a prior install
  // to prevent leaking if installDomShim is called twice without removeDomShim.
  for (const g of installedGlobals) {
    // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
    delete (globalThis as any)[g];
  }
  installedGlobals = [];

  // Also install the SSR adapter for backward compat
  setAdapter(createSSRAdapter());

  // Save existing globals so removeDomShim() can restore them
  // (prevents wiping happydom or other DOM environments in single-process test runners)
  // Only save on first install — re-installs should keep the original pre-shim state.
  if (!shimInstalled) {
    savedGlobals = new Map();
    for (const g of SHIM_GLOBALS) {
      if (g in globalThis) {
        // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
        savedGlobals.set(g, (globalThis as any)[g]);
      }
    }
  }

  shimInstalled = true;

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
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    cookie: '',
  };

  // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
  (globalThis as any).document = fakeDocument;

  // Window shim stubs — safe no-ops for SSR
  const windowStubs: Record<string, unknown> = {
    scrollTo: () => {},
    scroll: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    getComputedStyle: () => ({}),
    matchMedia: () => ({ matches: false, addListener: () => {}, removeListener: () => {} }),
  };

  // Provide a minimal window shim if not present
  if (typeof window === 'undefined') {
    // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
    (globalThis as any).window = {
      location: { pathname: ssrStorage.getStore()?.url || '/', search: '', hash: '' },
      history: {
        pushState: () => {},
        replaceState: () => {},
      },
      ...windowStubs,
    };
  } else {
    // CRITICAL FIX: Update window.location.pathname even if window already exists
    // This handles module caching where router.ts was already loaded but we're
    // rendering a different URL
    // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
    const win = (globalThis as any).window;
    win.location = {
      ...(win.location || {}),
      pathname: ssrStorage.getStore()?.url || '/',
    };
    // Ensure window stubs exist even if window was pre-existing (e.g. re-entry)
    for (const [key, val] of Object.entries(windowStubs)) {
      if (typeof win[key] !== 'function') {
        win[key] = val;
      }
    }
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

  // Storage stubs
  const storageStub = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  };
  installGlobal('localStorage', storageStub);
  installGlobal('sessionStorage', { ...storageStub });

  // Navigator stub
  installGlobal('navigator', {
    userAgent: '',
    language: 'en',
    languages: ['en'],
    onLine: true,
    cookieEnabled: false,
    hardwareConcurrency: 1,
    maxTouchPoints: 0,
    platform: '',
    vendor: '',
  });

  // Observer stubs
  const NoopObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
  installGlobal('IntersectionObserver', NoopObserver);
  installGlobal('ResizeObserver', NoopObserver);
  installGlobal('MutationObserver', NoopObserver);

  // Timing stubs — pure no-ops that return numeric IDs.
  // Callbacks are NOT scheduled during SSR to avoid async work leaking
  // after the render completes and the DOM shim is removed.
  let nextFrameId = 1;
  installGlobal('requestAnimationFrame', () => nextFrameId++);
  installGlobal('cancelAnimationFrame', () => {});
  installGlobal('requestIdleCallback', () => nextFrameId++);
  installGlobal('cancelIdleCallback', () => {});

  // CustomEvent stub
  installGlobal(
    'CustomEvent',
    class MockCustomEvent {
      type: string;
      detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail ?? null;
      }
    },
  );
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

  // Clean up browser-only stubs that we installed (skip runtime-provided ones)
  for (const g of installedGlobals) {
    // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
    delete (globalThis as any)[g];
  }
  installedGlobals = [];
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
