import { afterEach, describe, expect, it } from 'vitest';
import { endHydration, startHydration } from '../../hydrate/hydration-context';
import { signal } from '../../runtime/signal';
import {
  __append,
  __child,
  __element,
  __enterChildren,
  __exitChildren,
  __insert,
  __staticText,
  __text,
} from '../element';

describe('DOM helpers — hydration branches', () => {
  afterEach(() => {
    endHydration();
  });

  describe('__element', () => {
    it('adopts existing element during hydration', () => {
      const root = document.createElement('div');
      root.innerHTML = '<div></div>';
      const existingDiv = root.firstChild as HTMLElement;
      startHydration(root);

      const el = __element('div');
      expect(el).toBe(existingDiv);
    });

    it('creates new element when claim fails (fallback)', () => {
      const root = document.createElement('div');
      root.innerHTML = '<span></span>';
      startHydration(root);

      const el = __element('article');
      expect(el.tagName).toBe('ARTICLE');
      // Not the existing span
      expect(el).not.toBe(root.firstChild);
    });

    it('skips browser extension elements', () => {
      const root = document.createElement('div');
      const extension = document.createElement('grammarly-extension');
      const target = document.createElement('div');
      root.appendChild(extension);
      root.appendChild(target);
      startHydration(root);

      const el = __element('div');
      expect(el).toBe(target);
    });
  });

  describe('__text', () => {
    it('adopts existing text node during hydration', () => {
      const root = document.createElement('div');
      root.appendChild(document.createTextNode('Count: 0'));
      const existingText = root.firstChild as Text;
      startHydration(root);

      const count = signal(0);
      const node = __text(() => `Count: ${count.value}`);
      expect(node).toBe(existingText);
    });

    it('attaches reactive effect to adopted text node', () => {
      const root = document.createElement('div');
      root.appendChild(document.createTextNode('Count: 0'));
      startHydration(root);

      const count = signal(0);
      const node = __text(() => `Count: ${count.value}`);

      // After effect runs, data should match
      expect(node.data).toBe('Count: 0');

      // Reactive updates should work
      endHydration();
      count.value = 5;
      expect(node.data).toBe('Count: 5');
    });
  });

  describe('__child', () => {
    it('adopts existing span wrapper during hydration', () => {
      const root = document.createElement('div');
      const span = document.createElement('span');
      span.style.display = 'contents';
      span.textContent = 'hello';
      root.appendChild(span);
      startHydration(root);

      const wrapper = __child(() => 'hello');
      expect(wrapper).toBe(span);
    });

    it('attaches reactive effect to adopted wrapper', () => {
      const root = document.createElement('div');
      const span = document.createElement('span');
      span.style.display = 'contents';
      span.textContent = 'hello';
      root.appendChild(span);
      startHydration(root);

      const text = signal('hello');
      const wrapper = __child(() => text.value);
      expect(wrapper).toBe(span);

      // Reactive update after hydration ends
      endHydration();
      text.value = 'world';
      expect(wrapper.textContent).toBe('world');
    });
  });

  describe('__insert', () => {
    it('no-op for Node values during hydration', () => {
      const root = document.createElement('div');
      const child = document.createElement('span');
      root.appendChild(child);
      startHydration(root);

      // Should not append or throw — node already in DOM
      __insert(root, child);
      expect(root.childNodes.length).toBe(1);
    });

    it('adopts text node for string values during hydration', () => {
      const root = document.createElement('div');
      root.appendChild(document.createTextNode('static text'));
      startHydration(root);

      __insert(root, 'static text');
      // No new nodes created
      expect(root.childNodes.length).toBe(1);
    });
  });

  describe('__append', () => {
    it('no-op during hydration', () => {
      const root = document.createElement('div');
      startHydration(root);

      const child = document.createElement('span');
      __append(root, child);
      // Should NOT have appended
      expect(root.childNodes.length).toBe(0);
    });

    it('calls appendChild during CSR', () => {
      const parent = document.createElement('div');
      const child = document.createElement('span');
      __append(parent, child);
      expect(parent.firstChild).toBe(child);
    });
  });

  describe('__staticText', () => {
    it('claims existing text node during hydration', () => {
      const root = document.createElement('div');
      root.appendChild(document.createTextNode('hello'));
      const existingText = root.firstChild as Text;
      startHydration(root);

      const text = __staticText('hello');
      expect(text).toBe(existingText);
    });

    it('creates new text node during CSR', () => {
      const text = __staticText('hello');
      expect(text.data).toBe('hello');
    });
  });

  describe('__enterChildren / __exitChildren', () => {
    it('manages hydration cursor for nested elements', () => {
      const root = document.createElement('div');
      root.innerHTML = '<div><span></span></div><p></p>';
      startHydration(root);

      const div = __element('div');
      __enterChildren(div);
      const span = __element('span');
      expect(span.tagName).toBe('SPAN');
      __exitChildren();

      const p = __element('p');
      expect(p.tagName).toBe('P');
    });

    it('no-op during CSR', () => {
      const el = document.createElement('div');
      // Should not throw during CSR
      __enterChildren(el);
      __exitChildren();
    });
  });

  describe('CSR behavior unchanged', () => {
    it('all existing __element behavior works in CSR', () => {
      const el = __element('div');
      expect(el.tagName).toBe('DIV');
    });

    it('all existing __text behavior works in CSR', () => {
      const name = signal('world');
      const node = __text(() => `hello ${name.value}`);
      expect(node.data).toBe('hello world');
      name.value = 'vertz';
      expect(node.data).toBe('hello vertz');
    });

    it('all existing __child behavior works in CSR', () => {
      const wrapper = __child(() => 'test');
      expect(wrapper.tagName).toBe('SPAN');
      expect(wrapper.style.display).toBe('contents');
      expect(wrapper.textContent).toBe('test');
    });

    it('all existing __insert behavior works in CSR', () => {
      const parent = document.createElement('div');
      __insert(parent, 'text');
      expect(parent.textContent).toBe('text');
    });
  });
});
