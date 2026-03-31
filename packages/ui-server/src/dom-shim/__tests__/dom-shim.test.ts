import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { SSRRenderContext } from '@vertz/ui/internals';
import { ssrStorage } from '../../ssr-context';
import {
  installDomShim,
  removeDomShim,
  SSRComment,
  SSRDocumentFragment,
  SSRElement,
  SSRNode,
  SSRTextNode,
  toVNode,
} from '../index';

/** Create a minimal SSRRenderContext for testing. */
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

describe('DOM Shim', () => {
  afterEach(() => {
    removeDomShim();
  });

  describe('installDomShim', () => {
    it('should create a global document object', () => {
      installDomShim();
      expect(globalThis).toHaveProperty('document');
      expect(document.createElement).toBeDefined();
    });

    it('should create a minimal window object with SSR URL', () => {
      ssrStorage.run(testCtx('/test-path'), () => {
        installDomShim();
        expect(globalThis).toHaveProperty('window');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
        expect((window as any).location.pathname).toBe('/test-path');
      });
    });

    it('should expose DOM constructor globals', () => {
      installDomShim();
      expect(globalThis).toHaveProperty('Node');
      expect(globalThis).toHaveProperty('HTMLElement');
      expect(globalThis).toHaveProperty('DocumentFragment');
    });
  });

  describe('document.createElement', () => {
    beforeEach(() => {
      installDomShim();
    });

    it('should create an element with the given tag', () => {
      const el = document.createElement('div');
      expect(el).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
      expect((el as any).tag).toBe('div');
    });

    it('should support setAttribute and getAttribute', () => {
      const el = document.createElement('div');
      el.setAttribute('id', 'test-id');
      expect(el.getAttribute('id')).toBe('test-id');
    });

    it('should support appendChild', () => {
      const parent = document.createElement('div');
      const child = document.createElement('span');
      parent.appendChild(child);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
      expect((parent as any).children).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
      expect((parent as any).children[0]).toBe(child);
    });

    it('should handle className property', () => {
      const el = document.createElement('div');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
      (el as any).className = 'foo bar';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
      expect((el as any).className).toBe('foo bar');
      expect(el.getAttribute('class')).toBe('foo bar');
    });

    it('should support classList.add and classList.remove', () => {
      const el = document.createElement('div');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
      (el as any).classList.add('foo');
      expect(el.getAttribute('class')).toBe('foo');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
      (el as any).classList.add('bar');
      expect(el.getAttribute('class')).toContain('foo');
      expect(el.getAttribute('class')).toContain('bar');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
      (el as any).classList.remove('foo');
      expect(el.getAttribute('class')).toBe('bar');
    });

    it('should no-op event listeners', () => {
      const el = document.createElement('button');
      const handler = () => {};
      // Should not throw
      expect(() => {
        el.addEventListener('click', handler);
        el.removeEventListener('click', handler);
      }).not.toThrow();
    });
  });

  describe('document.createTextNode', () => {
    beforeEach(() => {
      installDomShim();
    });

    it('should create a text node with the given text', () => {
      const textNode = document.createTextNode('Hello');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
      expect((textNode as any).text).toBe('Hello');
    });

    it('should support data property', () => {
      const textNode = document.createTextNode('Hello');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
      expect((textNode as any).data).toBe('Hello');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
      (textNode as any).data = 'World';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
      expect((textNode as any).text).toBe('World');
    });
  });

  describe('document.createDocumentFragment', () => {
    beforeEach(() => {
      installDomShim();
    });

    it('should create a fragment that can hold children', () => {
      const fragment = document.createDocumentFragment();
      const child = document.createElement('div');
      fragment.appendChild(child);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
      expect((fragment as any).childNodes).toHaveLength(1);
    });

    it('should flatten when appended to an element', () => {
      const fragment = document.createDocumentFragment();
      const child1 = document.createElement('div');
      const child2 = document.createElement('span');
      fragment.appendChild(child1);
      fragment.appendChild(child2);

      const parent = document.createElement('div');
      parent.appendChild(fragment);

      // Fragment children should be moved to parent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
      expect((parent as any).children).toHaveLength(2);
    });
  });

  describe('toVNode', () => {
    beforeEach(() => {
      installDomShim();
    });

    it('should convert an SSRElement to a VNode', () => {
      const el = document.createElement('div');
      el.setAttribute('class', 'test');
      const textNode = document.createTextNode('Hello');
      el.appendChild(textNode);

      const vnode = toVNode(el);
      expect(vnode).toEqual({
        tag: 'div',
        attrs: { class: 'test' },
        children: ['Hello'],
      });
    });

    it('should handle nested elements', () => {
      const parent = document.createElement('div');
      const child = document.createElement('span');
      child.setAttribute('id', 'child-id');
      parent.appendChild(child);

      const vnode = toVNode(parent);
      expect(vnode).toEqual({
        tag: 'div',
        attrs: {},
        children: [
          {
            tag: 'span',
            attrs: { id: 'child-id' },
            children: [],
          },
        ],
      });
    });

    it('should convert document fragments to fragment vnodes', () => {
      const fragment = document.createDocumentFragment();
      const child1 = document.createElement('div');
      const child2 = document.createElement('span');
      fragment.appendChild(child1);
      fragment.appendChild(child2);

      const vnode = toVNode(fragment);
      expect(vnode.tag).toBe('fragment');
      expect(vnode.children).toHaveLength(2);
    });

    it('should pass through existing VNodes', () => {
      const existingVNode = { tag: 'div', attrs: {}, children: [] };
      const result = toVNode(existingVNode);
      expect(result).toBe(existingVNode);
    });
  });

  describe('insertBefore syncs children for toVNode serialization', () => {
    beforeEach(() => {
      installDomShim();
    });

    it('should include insertBefore-ed element in toVNode output', () => {
      const parent = document.createElement('div');
      const child = document.createElement('span');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim test
      (parent as any).insertBefore(child, null);

      const vnode = toVNode(parent);
      expect(vnode.children).toHaveLength(1);
      expect(vnode.children[0]).toEqual({
        tag: 'span',
        attrs: {},
        children: [],
      });
    });

    it('should include insertBefore-ed text node in toVNode output', () => {
      const parent = document.createElement('div');
      const text = document.createTextNode('hello');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim test
      (parent as any).insertBefore(text, null);

      const vnode = toVNode(parent);
      expect(vnode.children).toHaveLength(1);
      expect(vnode.children[0]).toBe('hello');
    });

    it('should insert before a reference node in children', () => {
      const parent = document.createElement('div');
      const first = document.createElement('span');
      parent.appendChild(first);

      const inserted = document.createElement('em');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim test
      (parent as any).insertBefore(inserted, first);

      const vnode = toVNode(parent);
      expect(vnode.children).toHaveLength(2);
      expect((vnode.children[0] as { tag: string }).tag).toBe('em');
      expect((vnode.children[1] as { tag: string }).tag).toBe('span');
    });
  });

  describe('_findChildIndex with duplicate text content', () => {
    beforeEach(() => {
      installDomShim();
    });

    it('should replace the correct text node when multiple have identical content', () => {
      const parent = document.createElement('div');
      const text1 = document.createTextNode('same');
      const text2 = document.createTextNode('same');
      parent.appendChild(text1);
      parent.appendChild(text2);

      // Replace the SECOND "same" text node with a new element
      const replacement = document.createElement('span');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim test
      (parent as any).replaceChild(replacement, text2);

      const vnode = toVNode(parent);
      // Should have: "same" (text1 kept), <span> (replaced text2)
      expect(vnode.children).toHaveLength(2);
      expect(vnode.children[0]).toBe('same');
      expect((vnode.children[1] as { tag: string }).tag).toBe('span');
    });

    it('should remove the correct text node when multiple have identical content', () => {
      const parent = document.createElement('div');
      const text1 = document.createTextNode('dup');
      const middle = document.createElement('em');
      const text2 = document.createTextNode('dup');
      parent.appendChild(text1);
      parent.appendChild(middle);
      parent.appendChild(text2);

      // Remove the FIRST "dup" text node
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim test
      (parent as any).removeChild(text1);

      const vnode = toVNode(parent);
      // Should have: <em>, "dup" (text2 kept)
      expect(vnode.children).toHaveLength(2);
      expect((vnode.children[0] as { tag: string }).tag).toBe('em');
      expect(vnode.children[1]).toBe('dup');
    });
  });

  describe('replaceChild syncs children for toVNode serialization', () => {
    beforeEach(() => {
      installDomShim();
    });

    it('should reflect replaceChild in toVNode output', () => {
      const parent = document.createElement('div');
      const original = document.createElement('span');
      parent.appendChild(original);

      const replacement = document.createElement('em');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim test
      (parent as any).replaceChild(replacement, original);

      const vnode = toVNode(parent);
      expect(vnode.children).toHaveLength(1);
      expect((vnode.children[0] as { tag: string }).tag).toBe('em');
    });
  });

  describe('removeDomShim', () => {
    it('should remove all DOM globals', () => {
      // Clear any pre-existing globals (e.g., from happydom in other test files)
      // so we can verify the shim cleans up after itself.
      const saved: Record<string, unknown> = {};
      for (const g of ['document', 'window'] as const) {
        if (g in globalThis) {
          saved[g] = (globalThis as Record<string, unknown>)[g];
          delete (globalThis as Record<string, unknown>)[g];
        }
      }

      try {
        installDomShim();
        expect(globalThis).toHaveProperty('document');
        expect(globalThis).toHaveProperty('window');

        removeDomShim();
        expect(globalThis).not.toHaveProperty('document');
        expect(globalThis).not.toHaveProperty('window');
      } finally {
        // Restore pre-existing globals
        for (const [g, v] of Object.entries(saved)) {
          (globalThis as Record<string, unknown>)[g] = v;
        }
      }
    });
  });

  describe('browser-only API stubs', () => {
    beforeEach(() => {
      installDomShim();
    });

    it('should stub localStorage with no-op methods', () => {
      expect(localStorage.getItem('key')).toBeNull();
      expect(() => localStorage.setItem('key', 'val')).not.toThrow();
      expect(() => localStorage.removeItem('key')).not.toThrow();
      expect(() => localStorage.clear()).not.toThrow();
      expect(localStorage.key(0)).toBeNull();
      expect(localStorage.length).toBe(0);
    });

    it('should stub sessionStorage with no-op methods', () => {
      expect(sessionStorage.getItem('key')).toBeNull();
      expect(() => sessionStorage.setItem('key', 'val')).not.toThrow();
      expect(() => sessionStorage.removeItem('key')).not.toThrow();
      expect(() => sessionStorage.clear()).not.toThrow();
      expect(sessionStorage.key(0)).toBeNull();
      expect(sessionStorage.length).toBe(0);
    });

    it('should provide navigator (stub if absent, existing if present)', () => {
      // navigator may already exist in the runtime (e.g. Bun provides it) —
      // the shim only installs if navigator is undefined.
      expect(navigator).toBeDefined();
      expect(typeof navigator.userAgent).toBe('string');
    });

    it('should stub IntersectionObserver with no-op methods', () => {
      const observer = new IntersectionObserver(() => {});
      expect(() => observer.observe(document.createElement('div'))).not.toThrow();
      expect(() => observer.unobserve(document.createElement('div'))).not.toThrow();
      expect(() => observer.disconnect()).not.toThrow();
      expect(observer.takeRecords()).toEqual([]);
    });

    it('should stub ResizeObserver with no-op methods', () => {
      const observer = new ResizeObserver(() => {});
      expect(() => observer.observe(document.createElement('div'))).not.toThrow();
      expect(() => observer.unobserve(document.createElement('div'))).not.toThrow();
      expect(() => observer.disconnect()).not.toThrow();
    });

    it('should stub MutationObserver with no-op methods', () => {
      const observer = new MutationObserver(() => {});
      expect(() => observer.disconnect()).not.toThrow();
      expect(observer.takeRecords()).toEqual([]);
    });

    it('should stub requestAnimationFrame returning a number', () => {
      const id = requestAnimationFrame(() => {});
      expect(typeof id).toBe('number');
    });

    it('should stub requestIdleCallback returning a number', () => {
      const id = requestIdleCallback(() => {});
      expect(typeof id).toBe('number');
    });

    it('should provide CustomEvent with type and detail', () => {
      // CustomEvent may already exist in the runtime — either way it should work
      const event = new CustomEvent('test', { detail: 42 });
      expect(event.type).toBe('test');
      expect(event.detail).toBe(42);
    });

    it('should stub document.querySelector returning null', () => {
      expect(document.querySelector('.foo')).toBeNull();
    });

    it('should stub document.querySelectorAll returning empty array', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
      expect((document as any).querySelectorAll('.foo')).toEqual([]);
    });

    it('should stub document.getElementById returning null', () => {
      expect(document.getElementById('test')).toBeNull();
    });

    it('should stub document.cookie as empty string outside SSR context', () => {
      expect(document.cookie).toBe('');
    });

    it('should read document.cookie from SSR context when inside a render', () => {
      const ctx = testCtx('/');
      ctx.cookies = 'theme=light; session=abc';
      ssrStorage.run(ctx, () => {
        expect(document.cookie).toBe('theme=light; session=abc');
      });
      // Outside the context, falls back to empty string
      expect(document.cookie).toBe('');
    });
  });

  describe('double install / remove idempotency', () => {
    it('should handle installDomShim called twice without removeDomShim', () => {
      // Clear pre-existing globals to test in isolation
      const saved: Record<string, unknown> = {};
      for (const g of ['document', 'localStorage'] as const) {
        if (g in globalThis) {
          saved[g] = (globalThis as Record<string, unknown>)[g];
          delete (globalThis as Record<string, unknown>)[g];
        }
      }

      try {
        installDomShim();
        installDomShim(); // second call should not throw or leak
        expect(document.createElement).toBeDefined();
        expect(localStorage.getItem('key')).toBeNull();
        removeDomShim();
        expect(globalThis).not.toHaveProperty('document');
        expect(globalThis).not.toHaveProperty('localStorage');
      } finally {
        for (const [g, v] of Object.entries(saved)) {
          (globalThis as Record<string, unknown>)[g] = v;
        }
      }
    });
  });

  describe('removeDomShim cleans up browser-only stubs', () => {
    it('should remove globals that were installed by the shim', () => {
      // Clear pre-existing globals to test in isolation
      const globalsToCheck = [
        'localStorage',
        'sessionStorage',
        'IntersectionObserver',
        'ResizeObserver',
        'MutationObserver',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
      ] as const;
      const saved: Record<string, unknown> = {};
      for (const g of globalsToCheck) {
        if (g in globalThis) {
          saved[g] = (globalThis as Record<string, unknown>)[g];
          delete (globalThis as Record<string, unknown>)[g];
        }
      }

      try {
        installDomShim();
        for (const g of globalsToCheck) {
          expect(globalThis).toHaveProperty(g);
        }

        removeDomShim();

        for (const g of globalsToCheck) {
          expect(globalThis).not.toHaveProperty(g);
        }
      } finally {
        for (const [g, v] of Object.entries(saved)) {
          (globalThis as Record<string, unknown>)[g] = v;
        }
      }
    });
  });

  describe('SSRComment', () => {
    it('should store text via constructor', () => {
      const comment = new SSRComment('hello');
      expect(comment.text).toBe('hello');
    });

    it('should expose text via data getter', () => {
      const comment = new SSRComment('hello');
      expect(comment.data).toBe('hello');
    });

    it('should update text via data setter', () => {
      const comment = new SSRComment('hello');
      comment.data = 'world';
      expect(comment.text).toBe('world');
      expect(comment.data).toBe('world');
    });
  });

  describe('SSRNode', () => {
    it('firstChild returns null when no children', () => {
      const node = new SSRNode();
      expect(node.firstChild).toBeNull();
    });

    it('firstChild returns the first child node', () => {
      const parent = new SSRNode();
      const child1 = new SSRNode();
      const child2 = new SSRNode();
      parent.childNodes.push(child1, child2);
      expect(parent.firstChild).toBe(child1);
    });

    it('nextSibling returns null when no parent', () => {
      const node = new SSRNode();
      expect(node.nextSibling).toBeNull();
    });

    it('nextSibling returns the next sibling node', () => {
      const parent = new SSRNode();
      const child1 = new SSRNode();
      const child2 = new SSRNode();
      parent.childNodes.push(child1, child2);
      child1.parentNode = parent;
      child2.parentNode = parent;
      expect(child1.nextSibling).toBe(child2);
    });

    it('nextSibling returns null for the last child', () => {
      const parent = new SSRNode();
      const child = new SSRNode();
      parent.childNodes.push(child);
      child.parentNode = parent;
      expect(child.nextSibling).toBeNull();
    });
  });

  describe('SSRElement removeAttribute', () => {
    it('should remove an attribute', () => {
      const el = new SSRElement('div');
      el.setAttribute('id', 'test');
      expect(el.getAttribute('id')).toBe('test');
      el.removeAttribute('id');
      expect(el.getAttribute('id')).toBeNull();
    });

    it('should clear classList when removing class attribute', () => {
      const el = new SSRElement('div');
      el.setAttribute('class', 'foo bar');
      el.removeAttribute('class');
      expect(el.getAttribute('class')).toBeNull();
      expect(el.className).toBe('');
    });
  });

  describe('SSRElement textContent', () => {
    it('should set and get textContent', () => {
      const el = new SSRElement('div');
      el.textContent = 'Hello world';
      expect(el.textContent).toBe('Hello world');
    });

    it('should replace children when setting textContent', () => {
      const el = new SSRElement('div');
      el.appendChild(new SSRElement('span'));
      el.textContent = 'replaced';
      expect(el.children).toEqual(['replaced']);
      expect(el.childNodes).toEqual([]);
    });

    it('should clear children when setting textContent to null', () => {
      const el = new SSRElement('div');
      el.textContent = 'text';
      el.textContent = null;
      expect(el.children).toEqual([]);
      expect(el.textContent).toBeNull();
    });
  });

  describe('SSRElement innerHTML', () => {
    it('should set and get innerHTML', () => {
      const el = new SSRElement('div');
      el.innerHTML = '<b>bold</b>';
      expect(el.innerHTML).toBe('<b>bold</b>');
    });

    it('should return empty string when innerHTML is not set', () => {
      const el = new SSRElement('div');
      expect(el.innerHTML).toBe('');
    });

    it('should replace children when setting innerHTML', () => {
      const el = new SSRElement('div');
      el.appendChild(new SSRElement('span'));
      el.innerHTML = '<em>new</em>';
      expect(el.children).toEqual(['<em>new</em>']);
      expect(el.childNodes).toEqual([]);
    });

    it('should clear children when setting innerHTML to empty string', () => {
      const el = new SSRElement('div');
      el.innerHTML = '<b>bold</b>';
      el.innerHTML = '';
      expect(el.children).toEqual([]);
    });
  });

  describe('toVNode fallback', () => {
    it('should wrap primitive numbers in a span', () => {
      const vnode = toVNode(42);
      expect(vnode).toEqual({ tag: 'span', attrs: {}, children: ['42'] });
    });

    it('should wrap primitive strings in a span', () => {
      const vnode = toVNode('hello');
      expect(vnode).toEqual({ tag: 'span', attrs: {}, children: ['hello'] });
    });
  });

  describe('toVNode with innerHTML content', () => {
    it('should emit innerHTML as raw HTML', () => {
      const el = new SSRElement('div');
      el.innerHTML = '<b>bold</b>';
      const vnode = el.toVNode();
      expect(vnode.children).toHaveLength(1);
      // innerHTML content should be wrapped as rawHtml
      const child = vnode.children[0];
      expect(typeof child).toBe('object');
      expect((child as { __raw: true; html: string }).html).toBe('<b>bold</b>');
    });
  });

  describe('toVNode with SSRComment child', () => {
    it('should serialize SSRComment as raw HTML comment', () => {
      const el = new SSRElement('div');
      const comment = new SSRComment('anchor');
      el.appendChild(comment);
      const vnode = el.toVNode();
      expect(vnode.children).toHaveLength(1);
      const child = vnode.children[0];
      expect(typeof child).toBe('object');
      expect((child as { __raw: true; html: string }).html).toBe('<!--anchor-->');
    });
  });

  describe('installDomShim with existing window', () => {
    it('should update window.location.pathname when window already exists', () => {
      // Pre-create a window-like global
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim test
      (globalThis as any).window = {
        location: { pathname: '/old', search: '', hash: '' },
        addEventListener: () => {},
        removeEventListener: () => {},
        history: { pushState: () => {}, replaceState: () => {} },
      };

      ssrStorage.run(testCtx('/new-path'), () => {
        installDomShim();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim test
        expect((window as any).location.pathname).toBe('/new-path');
      });
    });
  });

  describe('dataset property', () => {
    beforeEach(() => {
      installDomShim();
    });

    it('should set data-* attribute when assigning dataset property', () => {
      const el = new SSRElement('div');
      el.dataset.slot = 'alertdialog-trigger';
      expect(el.getAttribute('data-slot')).toBe('alertdialog-trigger');
    });

    it('should read from data-* attribute via dataset property', () => {
      const el = new SSRElement('div');
      el.setAttribute('data-slot', 'trigger');
      expect(el.dataset.slot).toBe('trigger');
    });

    it('should convert camelCase to kebab-case for attribute name', () => {
      const el = new SSRElement('div');
      el.dataset.testValue = 'hello';
      expect(el.getAttribute('data-test-value')).toBe('hello');
    });

    it('should convert kebab-case attribute to camelCase for reading', () => {
      const el = new SSRElement('div');
      el.setAttribute('data-test-value', 'hello');
      expect(el.dataset.testValue).toBe('hello');
    });

    it('should return undefined for unset dataset properties', () => {
      const el = new SSRElement('div');
      expect(el.dataset.missing).toBeUndefined();
    });

    it('should reflect dataset in toVNode output', () => {
      const el = new SSRElement('div');
      el.dataset.slot = 'trigger';
      const vnode = el.toVNode();
      expect(vnode.attrs['data-slot']).toBe('trigger');
    });

    it('should support Object.keys() enumeration', () => {
      const el = new SSRElement('div');
      el.dataset.slot = 'trigger';
      el.dataset.testValue = 'hello';
      const keys = Object.keys(el.dataset);
      expect(keys).toContain('slot');
      expect(keys).toContain('testValue');
      expect(keys).toHaveLength(2);
    });

    it('should support "in" operator', () => {
      const el = new SSRElement('div');
      el.dataset.slot = 'trigger';
      expect('slot' in el.dataset).toBe(true);
      expect('missing' in el.dataset).toBe(false);
    });

    it('should support spread operator', () => {
      const el = new SSRElement('div');
      el.dataset.slot = 'trigger';
      el.dataset.testValue = 'hello';
      const copy = { ...el.dataset };
      expect(copy).toEqual({ slot: 'trigger', testValue: 'hello' });
    });

    it('should coerce numeric values to string', () => {
      const el = new SSRElement('div');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing numeric coercion
      (el.dataset as any).count = 42;
      expect(el.getAttribute('data-count')).toBe('42');
    });

    it('should overwrite existing dataset value', () => {
      const el = new SSRElement('div');
      el.dataset.slot = 'a';
      el.dataset.slot = 'b';
      expect(el.dataset.slot).toBe('b');
      expect(el.getAttribute('data-slot')).toBe('b');
    });

    it('should delete data-* attribute when using delete operator', () => {
      const el = new SSRElement('div');
      el.dataset.slot = 'trigger';
      expect(el.getAttribute('data-slot')).toBe('trigger');
      delete el.dataset.slot;
      expect(el.getAttribute('data-slot')).toBeNull();
    });
  });

  describe('style property', () => {
    beforeEach(() => {
      installDomShim();
    });

    it('should update style attribute when setting style properties', () => {
      const el = document.createElement('div');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
      (el as any).style.color = 'red';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
      (el as any).style.fontSize = '16px';

      const styleAttr = el.getAttribute('style');
      expect(styleAttr).toContain('color: red');
      expect(styleAttr).toContain('font-size: 16px');
    });

    it('should convert camelCase to kebab-case', () => {
      const el = document.createElement('div');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR DOM shim requires dynamic typing
      (el as any).style.backgroundColor = 'blue';

      const styleAttr = el.getAttribute('style');
      expect(styleAttr).toContain('background-color: blue');
    });
  });

  describe('setAttribute with style objects', () => {
    it('should convert object style to CSS string', () => {
      const el = new SSRElement('div');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing object style support
      (el as any).setAttribute('style', { backgroundColor: 'red', marginTop: '1rem' });
      expect(el.attrs.style).toBe('background-color: red; margin-top: 1rem');
    });

    it('should handle string style unchanged', () => {
      const el = new SSRElement('div');
      el.setAttribute('style', 'color: red');
      expect(el.attrs.style).toBe('color: red');
    });

    it('should handle object style followed by el.style.display = none', () => {
      const el = new SSRElement('div');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing object style support
      (el as any).setAttribute('style', { backgroundColor: 'red' });
      el.style.display = 'none';
      expect(el.attrs.style).toContain('background-color: red');
      expect(el.attrs.style).toContain('display: none');
    });
  });

  describe('Reflecting IDL properties', () => {
    it('should reflect string properties to attrs', () => {
      const el = new SSRElement('input');
      el.placeholder = 'Enter text';
      el.type = 'password';
      el.name = 'email';
      el.value = 'test@example.com';
      expect(el.attrs.placeholder).toBe('Enter text');
      expect(el.attrs.type).toBe('password');
      expect(el.attrs.name).toBe('email');
      expect(el.attrs.value).toBe('test@example.com');
    });

    it('should reflect placeholder in toVNode output', () => {
      const el = new SSRElement('input');
      el.placeholder = 'Search...';
      const vnode = el.toVNode();
      expect(vnode.attrs?.placeholder).toBe('Search...');
    });

    it('should reflect boolean disabled property', () => {
      const el = new SSRElement('input');
      el.disabled = true;
      expect(el.attrs.disabled).toBe('');
      expect(el.disabled).toBe(true);

      el.disabled = false;
      expect('disabled' in el.attrs).toBe(false);
      expect(el.disabled).toBe(false);
    });

    it('should reflect htmlFor to for attribute', () => {
      const el = new SSRElement('label');
      el.htmlFor = 'input-1';
      expect(el.attrs.for).toBe('input-1');
      expect(el.htmlFor).toBe('input-1');
    });

    it('should reflect src and alt for images', () => {
      const el = new SSRElement('img');
      el.src = '/avatar.png';
      el.alt = 'User avatar';
      expect(el.attrs.src).toBe('/avatar.png');
      expect(el.attrs.alt).toBe('User avatar');
    });

    it('should reflect rows as number', () => {
      const el = new SSRElement('textarea');
      el.rows = 5;
      expect(el.attrs.rows).toBe('5');
      expect(el.rows).toBe(5);
    });

    it('should return default empty string for unset string IDL properties', () => {
      const el = new SSRElement('input');
      expect(el.placeholder).toBe('');
      expect(el.type).toBe('');
      expect(el.name).toBe('');
      expect(el.value).toBe('');
      expect(el.src).toBe('');
      expect(el.alt).toBe('');
      expect(el.scope).toBe('');
      expect(el.href).toBe('');
    });

    it('should reflect checked boolean property', () => {
      const el = new SSRElement('input');
      expect(el.checked).toBe(false);
      el.checked = true;
      expect(el.attrs.checked).toBe('');
      expect(el.checked).toBe(true);
      el.checked = false;
      expect('checked' in el.attrs).toBe(false);
      expect(el.checked).toBe(false);
    });

    it('should reflect selected boolean property', () => {
      const el = new SSRElement('option');
      expect(el.selected).toBe(false);
      el.selected = true;
      expect(el.attrs.selected).toBe('');
      expect(el.selected).toBe(true);
      el.selected = false;
      expect('selected' in el.attrs).toBe(false);
      expect(el.selected).toBe(false);
    });

    it('should reflect scope property', () => {
      const el = new SSRElement('th');
      el.scope = 'col';
      expect(el.attrs.scope).toBe('col');
      expect(el.scope).toBe('col');
    });

    it('should reflect href property', () => {
      const el = new SSRElement('a');
      el.href = '/about';
      expect(el.attrs.href).toBe('/about');
      expect(el.href).toBe('/about');
    });

    it('should return 0 for unset rows', () => {
      const el = new SSRElement('textarea');
      expect(el.rows).toBe(0);
    });

    it('should round-trip string IDL properties via getter', () => {
      const el = new SSRElement('input');
      el.placeholder = 'Search...';
      expect(el.placeholder).toBe('Search...');
      el.type = 'text';
      expect(el.type).toBe('text');
      el.name = 'q';
      expect(el.name).toBe('q');
      el.value = 'hello';
      expect(el.value).toBe('hello');
    });

    it('should round-trip src/alt via getter', () => {
      const el = new SSRElement('img');
      el.src = '/img.png';
      expect(el.src).toBe('/img.png');
      el.alt = 'logo';
      expect(el.alt).toBe('logo');
    });
  });

  describe('style proxy get handler', () => {
    it('should return empty string for unset style properties', () => {
      const el = new SSRElement('div');
      expect(el.style.color).toBe('');
      expect(el.style.display).toBe('');
    });

    it('should return set value after assignment', () => {
      const el = new SSRElement('div');
      el.style.color = 'red';
      expect(el.style.color).toBe('red');
    });
  });

  describe('comment markers in SSR (#2020)', () => {
    it('should preserve comment nodes when fragment is inserted via insertBefore on SSRDocumentFragment', () => {
      // Simulate __child CSR path: fragment with anchor + endMarker
      const childFragment = new SSRDocumentFragment();
      const anchor = new SSRComment('child');
      const endMarker = new SSRComment('/child');
      childFragment.appendChild(anchor);
      childFragment.appendChild(endMarker);

      // Simulate resolveAndInsertAfter flattening the conditional fragment:
      // Each child is inserted individually via insertBefore on the parent fragment
      const conditionalComment = new SSRComment('conditional');
      const content = new SSRElement('span');
      const conditionalEndComment = new SSRComment('/conditional');

      childFragment.insertBefore(conditionalComment, endMarker);
      childFragment.insertBefore(content, endMarker);
      childFragment.insertBefore(conditionalEndComment, endMarker);

      // Verify childNodes has all nodes in correct order
      expect(childFragment.childNodes.length).toBe(5);
      expect((childFragment.childNodes[0] as SSRComment).text).toBe('child');
      expect((childFragment.childNodes[1] as SSRComment).text).toBe('conditional');
      expect((childFragment.childNodes[2] as SSRElement).tag).toBe('span');
      expect((childFragment.childNodes[3] as SSRComment).text).toBe('/conditional');
      expect((childFragment.childNodes[4] as SSRComment).text).toBe('/child');

      // children array must be in sync with childNodes
      expect(childFragment.children.length).toBe(5);

      // Now flatten into a parent element (simulates __append(div, childFragment))
      const div = new SSRElement('div');
      div.appendChild(childFragment);

      expect(div.children.length).toBe(5);

      // Serialize to VNode and check HTML output
      const vnode = div.toVNode();
      const html = serializeVNode(vnode);
      expect(html).toContain('<!--child-->');
      expect(html).toContain('<!--conditional-->');
      expect(html).toContain('<!--/conditional-->');
      expect(html).toContain('<!--/child-->');
    });

    it('should sync children array on insertBefore', () => {
      const frag = new SSRDocumentFragment();
      const a = new SSRComment('a');
      const b = new SSRComment('b');
      frag.appendChild(a);

      frag.insertBefore(b, a);

      expect(frag.children.length).toBe(2);
      expect(frag.children[0]).toBe(b);
      expect(frag.children[1]).toBe(a);
    });

    it('should append on insertBefore with null reference', () => {
      const frag = new SSRDocumentFragment();
      const a = new SSRComment('a');
      frag.insertBefore(a, null);

      expect(frag.children.length).toBe(1);
      expect(frag.children[0]).toBe(a);
      expect(frag.childNodes.length).toBe(1);
    });

    it('should do nothing on insertBefore with unknown reference node', () => {
      const frag = new SSRDocumentFragment();
      const a = new SSRComment('a');
      const orphan = new SSRComment('orphan');
      frag.appendChild(a);

      // referenceNode not found — should be a no-op
      frag.insertBefore(new SSRComment('b'), orphan);

      expect(frag.children.length).toBe(1);
      expect(frag.childNodes.length).toBe(1);
    });

    it('should flatten fragment via insertBefore', () => {
      const parent = new SSRDocumentFragment();
      const ref = new SSRComment('ref');
      parent.appendChild(ref);

      const inner = new SSRDocumentFragment();
      inner.appendChild(new SSRComment('x'));
      inner.appendChild(new SSRElement('p'));

      parent.insertBefore(inner, ref);

      expect(parent.children.length).toBe(3);
      expect(parent.childNodes.length).toBe(3);
      expect((parent.childNodes[0] as SSRComment).text).toBe('x');
      expect((parent.childNodes[1] as SSRElement).tag).toBe('p');
      expect((parent.childNodes[2] as SSRComment).text).toBe('ref');
    });

    it('should handle SSRTextNode via insertBefore', () => {
      const frag = new SSRDocumentFragment();
      const ref = new SSRComment('end');
      frag.appendChild(ref);

      const text = new SSRTextNode('hello');
      frag.insertBefore(text, ref);

      expect(frag.children.length).toBe(2);
      expect(frag.children[0]).toBe('hello');
      expect(frag.childNodes.length).toBe(2);
    });

    it('should sync children on removeChild', () => {
      const frag = new SSRDocumentFragment();
      const a = new SSRComment('a');
      const b = new SSRElement('p');
      const c = new SSRComment('c');
      frag.appendChild(a);
      frag.appendChild(b);
      frag.appendChild(c);

      expect(frag.children.length).toBe(3);

      frag.removeChild(b);

      expect(frag.children.length).toBe(2);
      expect(frag.children[0]).toBe(a);
      expect(frag.children[1]).toBe(c);
    });

    it('should sync children on replaceChild', () => {
      const frag = new SSRDocumentFragment();
      const old = new SSRComment('old');
      frag.appendChild(old);

      const replacement = new SSRElement('div');
      frag.replaceChild(replacement, old);

      expect(frag.children.length).toBe(1);
      expect(frag.children[0]).toBe(replacement);
    });

    it('should preserve all nodes when fragment with insertBefore children is appended to another fragment', () => {
      // Inner fragment: simulates __child result with insertBefore content
      const inner = new SSRDocumentFragment();
      const childAnchor = new SSRComment('child');
      const childEnd = new SSRComment('/child');
      inner.appendChild(childAnchor);
      inner.appendChild(childEnd);

      // Insert conditional markers via insertBefore
      inner.insertBefore(new SSRComment('conditional'), childEnd);
      inner.insertBefore(new SSRElement('p'), childEnd);
      inner.insertBefore(new SSRComment('/conditional'), childEnd);

      // Outer fragment: simulates root component returning <>...</>
      const outer = new SSRDocumentFragment();
      outer.appendChild(inner);

      // Fragment-to-fragment should use childNodes as source of truth
      expect(outer.children.length).toBe(5);

      // toVNode should serialize all nodes including comments
      const vnode = toVNode(outer);
      const html = serializeVNode(vnode);
      expect(html).toContain('<!--conditional-->');
      expect(html).toContain('<!--/conditional-->');
    });

    it('should include SSRComment in fragment toVNode children', () => {
      const frag = new SSRDocumentFragment();
      frag.appendChild(new SSRComment('conditional'));
      frag.appendChild(new SSRElement('span'));

      const vnode = toVNode(frag);
      expect(vnode.children.length).toBe(2);

      const html = serializeVNode(vnode);
      expect(html).toContain('<!--conditional-->');
    });
  });
});

/** Simple VNode → HTML serializer for tests */
function serializeVNode(node: ReturnType<typeof toVNode> | string): string {
  if (typeof node === 'string') return node;
  if ('html' in node) return (node as { html: string }).html;
  const { tag, attrs, children } = node;
  if (tag === 'fragment') {
    return children.map((c) => serializeVNode(c as ReturnType<typeof toVNode>)).join('');
  }
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');
  const childHtml = children.map((c) => serializeVNode(c as ReturnType<typeof toVNode>)).join('');
  return `<${tag}${attrStr}>${childHtml}</${tag}>`;
}
