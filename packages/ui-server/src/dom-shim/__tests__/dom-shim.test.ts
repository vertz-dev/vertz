import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDomShim, removeDomShim, toVNode } from '../index';

describe('DOM Shim', () => {
  beforeEach(() => {
    // Set SSR context flag
    // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
    (globalThis as any).__SSR_URL__ = '/test-path';
  });

  afterEach(() => {
    removeDomShim();
    // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
    delete (globalThis as any).__SSR_URL__;
  });

  describe('installDomShim', () => {
    it('should create a global document object', () => {
      installDomShim();
      expect(globalThis).toHaveProperty('document');
      expect(document.createElement).toBeDefined();
    });

    it('should create a minimal window object', () => {
      installDomShim();
      expect(globalThis).toHaveProperty('window');
      // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
      expect((window as any).location.pathname).toBe('/test-path');
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
