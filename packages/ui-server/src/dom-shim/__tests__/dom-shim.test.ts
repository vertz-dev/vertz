import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDomShim, removeDomShim, toVNode } from '../index';

describe('DOM Shim', () => {
  beforeEach(() => {
    // Set SSR context flag
    (globalThis as any).__SSR_URL__ = '/test-path';
  });

  afterEach(() => {
    removeDomShim();
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
      expect((parent as any).children).toHaveLength(1);
      expect((parent as any).children[0]).toBe(child);
    });

    it('should handle className property', () => {
      const el = document.createElement('div');
      (el as any).className = 'foo bar';
      expect((el as any).className).toBe('foo bar');
      expect(el.getAttribute('class')).toBe('foo bar');
    });

    it('should support classList.add and classList.remove', () => {
      const el = document.createElement('div');
      (el as any).classList.add('foo');
      expect(el.getAttribute('class')).toBe('foo');
      (el as any).classList.add('bar');
      expect(el.getAttribute('class')).toContain('foo');
      expect(el.getAttribute('class')).toContain('bar');
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
      expect((textNode as any).text).toBe('Hello');
    });

    it('should support data property', () => {
      const textNode = document.createTextNode('Hello');
      expect((textNode as any).data).toBe('Hello');
      (textNode as any).data = 'World';
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
      (el as any).style.color = 'red';
      (el as any).style.fontSize = '16px';

      const styleAttr = el.getAttribute('style');
      expect(styleAttr).toContain('color: red');
      expect(styleAttr).toContain('font-size: 16px');
    });

    it('should convert camelCase to kebab-case', () => {
      const el = document.createElement('div');
      (el as any).style.backgroundColor = 'blue';

      const styleAttr = el.getAttribute('style');
      expect(styleAttr).toContain('background-color: blue');
    });
  });
});
