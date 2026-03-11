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
  beforeEach(() => {
    // Ensure clean state — other test files may leave the shim installed,
    // which poisons the savedGlobals snapshot in installDomShim().
    // Force-clean all shim globals so the next installDomShim() starts fresh.
    removeDomShim();
    for (const g of [
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
      'localStorage',
      'sessionStorage',
      'IntersectionObserver',
      'ResizeObserver',
      'MutationObserver',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'CustomEvent',
    ] as const) {
      delete (globalThis as Record<string, unknown>)[g];
    }
  });

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
        // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
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
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
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
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
      expect((parent as any).children).toHaveLength(1);
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
      expect((parent as any).children[0]).toBe(child);
    });

    it('should handle className property', () => {
      const el = document.createElement('div');
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
      (el as any).className = 'foo bar';
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
      expect((el as any).className).toBe('foo bar');
      expect(el.getAttribute('class')).toBe('foo bar');
    });

    it('should support classList.add and classList.remove', () => {
      const el = document.createElement('div');
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
      (el as any).classList.add('foo');
      expect(el.getAttribute('class')).toBe('foo');
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
      (el as any).classList.add('bar');
      expect(el.getAttribute('class')).toContain('foo');
      expect(el.getAttribute('class')).toContain('bar');
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
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
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
      expect((textNode as any).text).toBe('Hello');
    });

    it('should support data property', () => {
      const textNode = document.createTextNode('Hello');
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
      expect((textNode as any).data).toBe('Hello');
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
      (textNode as any).data = 'World';
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
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
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
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
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
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
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim test
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
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim test
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
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim test
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
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim test
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
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim test
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
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim test
      (parent as any).replaceChild(replacement, original);

      const vnode = toVNode(parent);
      expect(vnode.children).toHaveLength(1);
      expect((vnode.children[0] as { tag: string }).tag).toBe('em');
    });
  });

  describe('removeDomShim', () => {
    it('should remove all DOM globals', () => {
      installDomShim();
      expect(globalThis).toHaveProperty('document');
      expect(globalThis).toHaveProperty('window');

      removeDomShim();
      expect(globalThis).not.toHaveProperty('document');
      expect(globalThis).not.toHaveProperty('window');
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
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
      expect((document as any).querySelectorAll('.foo')).toEqual([]);
    });

    it('should stub document.getElementById returning null', () => {
      expect(document.getElementById('test')).toBeNull();
    });

    it('should stub document.cookie as empty string', () => {
      expect(document.cookie).toBe('');
    });
  });

  describe('double install / remove idempotency', () => {
    it('should handle installDomShim called twice without removeDomShim', () => {
      installDomShim();
      installDomShim(); // second call should not throw or leak
      expect(document.createElement).toBeDefined();
      expect(localStorage.getItem('key')).toBeNull();
      removeDomShim();
      expect(globalThis).not.toHaveProperty('document');
      expect(globalThis).not.toHaveProperty('localStorage');
    });
  });

  describe('removeDomShim cleans up browser-only stubs', () => {
    it('should remove globals that were installed by the shim', () => {
      installDomShim();
      // These are always installed by the shim (not present in Bun runtime)
      expect(globalThis).toHaveProperty('localStorage');
      expect(globalThis).toHaveProperty('sessionStorage');
      expect(globalThis).toHaveProperty('IntersectionObserver');
      expect(globalThis).toHaveProperty('ResizeObserver');
      expect(globalThis).toHaveProperty('MutationObserver');
      expect(globalThis).toHaveProperty('requestAnimationFrame');
      expect(globalThis).toHaveProperty('cancelAnimationFrame');
      expect(globalThis).toHaveProperty('requestIdleCallback');
      expect(globalThis).toHaveProperty('cancelIdleCallback');

      removeDomShim();

      // Shim-installed globals should be removed
      expect(globalThis).not.toHaveProperty('localStorage');
      expect(globalThis).not.toHaveProperty('sessionStorage');
      expect(globalThis).not.toHaveProperty('IntersectionObserver');
      expect(globalThis).not.toHaveProperty('ResizeObserver');
      expect(globalThis).not.toHaveProperty('MutationObserver');
      expect(globalThis).not.toHaveProperty('requestAnimationFrame');
      expect(globalThis).not.toHaveProperty('cancelAnimationFrame');
      expect(globalThis).not.toHaveProperty('requestIdleCallback');
      expect(globalThis).not.toHaveProperty('cancelIdleCallback');
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
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim test
      (globalThis as any).window = {
        location: { pathname: '/old', search: '', hash: '' },
        addEventListener: () => {},
        removeEventListener: () => {},
        history: { pushState: () => {}, replaceState: () => {} },
      };

      ssrStorage.run(testCtx('/new-path'), () => {
        installDomShim();
        // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim test
        expect((window as any).location.pathname).toBe('/new-path');
      });
    });
  });

  describe('style property', () => {
    beforeEach(() => {
      installDomShim();
    });

    it('should update style attribute when setting style properties', () => {
      const el = document.createElement('div');
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
      (el as any).style.color = 'red';
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
      (el as any).style.fontSize = '16px';

      const styleAttr = el.getAttribute('style');
      expect(styleAttr).toContain('color: red');
      expect(styleAttr).toContain('font-size: 16px');
    });

    it('should convert camelCase to kebab-case', () => {
      const el = document.createElement('div');
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
      (el as any).style.backgroundColor = 'blue';

      const styleAttr = el.getAttribute('style');
      expect(styleAttr).toContain('background-color: blue');
    });
  });
});
