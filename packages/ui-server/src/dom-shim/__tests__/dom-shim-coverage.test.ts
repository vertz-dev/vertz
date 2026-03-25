/**
 * Targeted tests for dom-shim/index.ts coverage gaps.
 *
 * Bun's coverage tool under-counts certain patterns in this file.
 * This test exercises the specific code paths to maximize coverage attribution.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import type { SSRRenderContext } from '@vertz/ui/internals';
import { ssrStorage } from '../../ssr-context';
import {
  installDomShim,
  removeDomShim,
  SSRComment,
  SSRDocumentFragment,
  SSRElement,
  SSRTextNode,
  toVNode,
} from '../index';

function testCtx(url: string): SSRRenderContext {
  return {
    url,
    adapter: {} as SSRRenderContext['adapter'],
    subscriber: null,
    readValueCb: null,
    cleanupStack: [],
    batchDepth: 0,
    pendingEffects: new Map(),
    contextScope: null,
    entityStore: {} as SSRRenderContext['entityStore'],
    envelopeStore: {} as SSRRenderContext['envelopeStore'],
    queryCache: {} as SSRRenderContext['queryCache'],
    inflight: new Map(),
    queries: [],
    errors: [],
  };
}

describe('dom-shim coverage: installDomShim internals', () => {
  afterEach(() => {
    removeDomShim();
  });

  it('installs fakeDocument with createElement, createTextNode, createComment, createDocumentFragment', () => {
    installDomShim();
    const el = document.createElement('div');
    expect(el).toBeInstanceOf(SSRElement);
    const text = document.createTextNode('hi');
    expect(text).toBeInstanceOf(SSRTextNode);
    const comment = (document as any).createComment('c');
    expect(comment).toBeInstanceOf(SSRComment);
    const frag = document.createDocumentFragment();
    expect(frag).toBeInstanceOf(SSRDocumentFragment);
  });

  it('installs document.head and document.body as SSRElements', () => {
    installDomShim();
    expect((document as any).head).toBeInstanceOf(SSRElement);
    expect((document as any).body).toBeInstanceOf(SSRElement);
  });

  it('installs window with location.pathname from ssrStorage', () => {
    ssrStorage.run(testCtx('/foo'), () => {
      installDomShim();
      expect((globalThis as any).window.location.pathname).toBe('/foo');
    });
  });

  it('falls back to "/" when no ssrStorage context', () => {
    installDomShim();
    expect((globalThis as any).window.location.pathname).toBe('/');
  });

  it('installs window.history with pushState/replaceState stubs', () => {
    installDomShim();
    expect(typeof (globalThis as any).window.history.pushState).toBe('function');
    expect(typeof (globalThis as any).window.history.replaceState).toBe('function');
  });

  it('installs DOM constructor globals (Node, HTMLElement, HTMLAnchorElement, etc.)', () => {
    installDomShim();
    const g = globalThis as any;
    expect(g.Node).toBeDefined();
    expect(g.HTMLElement).toBeDefined();
    expect(g.HTMLAnchorElement).toBeDefined();
    expect(g.HTMLDivElement).toBeDefined();
    expect(g.HTMLInputElement).toBeDefined();
    expect(g.HTMLButtonElement).toBeDefined();
    expect(g.HTMLSelectElement).toBeDefined();
    expect(g.HTMLTextAreaElement).toBeDefined();
    expect(g.DocumentFragment).toBeDefined();
    expect(g.MouseEvent).toBeDefined();
    expect(g.Event).toBeDefined();
  });

  it('installs MockCustomEvent with type and detail', () => {
    // Delete any existing CustomEvent to ensure shim installs its version
    const saved = (globalThis as any).CustomEvent;
    delete (globalThis as any).CustomEvent;
    try {
      installDomShim();
      const event = new CustomEvent('test', { detail: 99 });
      expect(event.type).toBe('test');
      expect(event.detail).toBe(99);
    } finally {
      // afterEach handles removeDomShim(); just restore CustomEvent
      if (saved !== undefined) {
        (globalThis as any).CustomEvent = saved;
      }
    }
  });

  it('CustomEvent defaults detail to null when no init', () => {
    const saved = (globalThis as any).CustomEvent;
    delete (globalThis as any).CustomEvent;
    try {
      installDomShim();
      const event = new CustomEvent('bare');
      expect(event.type).toBe('bare');
      expect(event.detail).toBeNull();
    } finally {
      // afterEach handles removeDomShim(); just restore CustomEvent
      if (saved !== undefined) {
        (globalThis as any).CustomEvent = saved;
      }
    }
  });

  it('cleans up previously tracked globals on double install', () => {
    // Clear pre-existing localStorage (e.g., from happydom in other test files)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test isolation requires dynamic global access
    const savedLs = 'localStorage' in globalThis ? (globalThis as any).localStorage : undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test isolation requires dynamic global access
    if (savedLs !== undefined) delete (globalThis as any).localStorage;

    try {
      installDomShim();
      // Second install should clean up tracked globals from first install
      installDomShim();
      expect(localStorage.getItem('x')).toBeNull();
      removeDomShim();
      expect(globalThis).not.toHaveProperty('localStorage');
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test isolation requires dynamic global access
      if (savedLs !== undefined) (globalThis as any).localStorage = savedLs;
    }
  });

  it('cancelAnimationFrame is a no-op', () => {
    installDomShim();
    expect(() => cancelAnimationFrame(1)).not.toThrow();
  });

  it('cancelIdleCallback is a no-op', () => {
    installDomShim();
    expect(() => (globalThis as any).cancelIdleCallback(1)).not.toThrow();
  });

  it('requestAnimationFrame returns incrementing IDs', () => {
    installDomShim();
    const id1 = requestAnimationFrame(() => {});
    const id2 = requestAnimationFrame(() => {});
    expect(id2).toBeGreaterThan(id1);
  });
});

describe('dom-shim coverage: removeDomShim edge cases', () => {
  it('removeDomShim without install is a no-op', () => {
    removeDomShim();
    // Should not throw
  });

  it('removeDomShim restores pre-existing globals', () => {
    // Pre-set a global that SHIM_GLOBALS includes
    const originalEvent = (globalThis as any).Event;
    const preExisting = class PreExisting {};
    (globalThis as any).Event = preExisting;

    installDomShim();
    // Shim replaces Event with its own version
    expect((globalThis as any).Event).not.toBe(preExisting);

    removeDomShim();
    // Should restore the pre-existing Event, not delete it
    expect((globalThis as any).Event).toBe(preExisting);

    // Clean up — restore whatever was there originally
    if (originalEvent !== undefined) {
      (globalThis as any).Event = originalEvent;
    } else {
      delete (globalThis as any).Event;
    }
  });
});

describe('dom-shim coverage: toVNode with fragment text children', () => {
  it('converts fragment with text node children to strings', () => {
    const frag = new SSRDocumentFragment();
    const text = new SSRTextNode('hello');
    frag.appendChild(text);
    const vnode = toVNode(frag);
    expect(vnode.tag).toBe('fragment');
    expect(vnode.children[0]).toBe('hello');
  });
});
