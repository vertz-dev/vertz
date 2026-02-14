import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { installDomShim, removeDomShim, SSRElement, SSRTextNode, SSRDocumentFragment, toVNode } from '../dom-shim';

describe('DOM shim', () => {
  beforeEach(() => {
    (globalThis as any).__SSR_URL__ = '/';
    installDomShim();
  });

  afterEach(() => {
    delete (globalThis as any).__SSR_URL__;
    removeDomShim();
  });

  describe('document', () => {
    test('provides createElement', () => {
      const el = document.createElement('div');
      expect(el).toBeInstanceOf(SSRElement);
      expect((el as any).tag).toBe('div');
    });

    test('provides createTextNode', () => {
      const text = document.createTextNode('hello');
      expect(text).toBeInstanceOf(SSRTextNode);
      expect((text as any).text).toBe('hello');
    });

    test('provides createComment', () => {
      const comment = document.createComment('test');
      expect(comment).toBeDefined();
    });

    test('provides createDocumentFragment', () => {
      const frag = document.createDocumentFragment();
      expect(frag).toBeInstanceOf(SSRDocumentFragment);
    });
  });

  describe('SSRElement', () => {
    test('setAttribute and getAttribute', () => {
      const el = new SSRElement('div');
      el.setAttribute('id', 'test');
      expect(el.getAttribute('id')).toBe('test');
    });

    test('removeAttribute', () => {
      const el = new SSRElement('div');
      el.setAttribute('id', 'test');
      el.removeAttribute('id');
      expect(el.getAttribute('id')).toBeNull();
    });

    test('appendChild with element', () => {
      const parent = new SSRElement('div');
      const child = new SSRElement('span');
      parent.appendChild(child);
      expect(parent.children).toContain(child);
      expect(parent.childNodes).toContain(child);
      expect(child.parentNode).toBe(parent);
    });

    test('appendChild with text node', () => {
      const parent = new SSRElement('div');
      const text = new SSRTextNode('hello');
      parent.appendChild(text);
      expect(parent.children).toContain('hello');
      expect(parent.childNodes).toContain(text);
      expect(text.parentNode).toBe(parent);
    });

    test('appendChild with document fragment', () => {
      const parent = new SSRElement('div');
      const frag = new SSRDocumentFragment();
      const child1 = new SSRElement('span');
      const child2 = new SSRElement('p');
      frag.appendChild(child1);
      frag.appendChild(child2);
      parent.appendChild(frag);
      expect(parent.children).toContain(child1);
      expect(parent.children).toContain(child2);
      expect(child1.parentNode).toBe(parent);
      expect(child2.parentNode).toBe(parent);
    });

    test('removeChild', () => {
      const parent = new SSRElement('div');
      const child = new SSRElement('span');
      parent.appendChild(child);
      parent.removeChild(child);
      expect(parent.children).not.toContain(child);
      expect(parent.childNodes).not.toContain(child);
      expect(child.parentNode).toBeNull();
    });

    test('insertBefore', () => {
      const parent = new SSRElement('div');
      const child1 = new SSRElement('span');
      const child2 = new SSRElement('p');
      parent.appendChild(child1);
      parent.insertBefore(child2, child1);
      expect(parent.childNodes[0]).toBe(child2);
      expect(parent.childNodes[1]).toBe(child1);
    });

    test('replaceChild', () => {
      const parent = new SSRElement('div');
      const child1 = new SSRElement('span');
      const child2 = new SSRElement('p');
      parent.appendChild(child1);
      parent.replaceChild(child2, child1);
      expect(parent.childNodes).toContain(child2);
      expect(parent.childNodes).not.toContain(child1);
      expect(child1.parentNode).toBeNull();
      expect(child2.parentNode).toBe(parent);
    });

    test('firstChild', () => {
      const parent = new SSRElement('div');
      expect(parent.firstChild).toBeNull();
      const child = new SSRElement('span');
      parent.appendChild(child);
      expect(parent.firstChild).toBe(child);
    });

    test('nextSibling', () => {
      const parent = new SSRElement('div');
      const child1 = new SSRElement('span');
      const child2 = new SSRElement('p');
      parent.appendChild(child1);
      parent.appendChild(child2);
      expect(child1.nextSibling).toBe(child2);
      expect(child2.nextSibling).toBeNull();
    });

    test('classList add and remove', () => {
      const el = new SSRElement('div');
      el.classList.add('foo');
      expect(el.attrs.class).toBe('foo');
      el.classList.add('bar');
      expect(el.attrs.class).toBe('foo bar');
      el.classList.remove('foo');
      expect(el.attrs.class).toBe('bar');
    });

    test('className getter/setter', () => {
      const el = new SSRElement('div');
      el.className = 'foo bar';
      expect(el.className).toBe('foo bar');
    });

    test('style proxy sets attribute', () => {
      const el = new SSRElement('div');
      el.style.display = 'none';
      expect(el.attrs.style).toContain('display: none');
    });

    test('textContent clears children', () => {
      const el = new SSRElement('div');
      const child = new SSRElement('span');
      el.appendChild(child);
      el.textContent = 'hello';
      expect(el.children).toEqual(['hello']);
    });

    test('addEventListener/removeEventListener are no-ops', () => {
      const el = new SSRElement('div');
      // Should not throw
      el.addEventListener('click', () => {});
      el.removeEventListener('click', () => {});
    });

    test('toVNode', () => {
      const el = new SSRElement('div');
      el.setAttribute('id', 'test');
      const child = new SSRElement('span');
      el.appendChild(child);
      
      const vnode = el.toVNode();
      expect(vnode.tag).toBe('div');
      expect(vnode.attrs.id).toBe('test');
      expect(vnode.children).toHaveLength(1);
    });
  });

  describe('SSRTextNode', () => {
    test('has data property as alias for text', () => {
      const node = new SSRTextNode('hello');
      expect(node.data).toBe('hello');
      node.data = 'world';
      expect(node.text).toBe('world');
    });
  });

  describe('toVNode', () => {
    test('converts SSRElement to VNode', () => {
      const el = new SSRElement('div');
      const vnode = toVNode(el);
      expect(vnode.tag).toBe('div');
    });

    test('converts SSRDocumentFragment to VNode', () => {
      const frag = new SSRDocumentFragment();
      const child = new SSRElement('span');
      frag.appendChild(child);
      const vnode = toVNode(frag);
      expect(vnode.tag).toBe('fragment');
    });

    test('passes through existing VNode', () => {
      const vnode = { tag: 'div', attrs: {}, children: [] };
      expect(toVNode(vnode)).toBe(vnode);
    });
  });

  describe('global constructors', () => {
    test('provides Node constructor', () => {
      expect((globalThis as any).Node).toBeDefined();
    });

    test('provides HTMLElement constructor', () => {
      expect((globalThis as any).HTMLElement).toBeDefined();
    });

    test('provides DocumentFragment constructor', () => {
      expect((globalThis as any).DocumentFragment).toBeDefined();
    });
  });

  describe('window shim', () => {
    test('provides window.location.pathname', () => {
      expect((globalThis as any).window.location.pathname).toBe('/');
    });

    test('provides window.addEventListener', () => {
      expect(typeof (globalThis as any).window.addEventListener).toBe('function');
    });

    test('provides window.history', () => {
      expect((globalThis as any).window.history).toBeDefined();
      expect(typeof (globalThis as any).window.history.pushState).toBe('function');
    });
  });
});
