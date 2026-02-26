import { describe, expect, it } from 'bun:test';
import { Fragment, jsx, jsxDEV, jsxs } from '../index';

describe('JSX Runtime (Client)', () => {
  describe('jsx - intrinsic elements', () => {
    it('should create a DOM element with the given tag', () => {
      const el = jsx('div', {});
      expect(el).toBeInstanceOf(HTMLDivElement);
    });

    it('should set attributes', () => {
      const el = jsx('div', { id: 'test', class: 'container' });
      expect(el.getAttribute('id')).toBe('test');
      expect(el.getAttribute('class')).toBe('container');
    });

    it('should append text children', () => {
      const el = jsx('p', { children: 'Hello, world!' });
      expect(el.textContent).toBe('Hello, world!');
    });

    it('should append element children', () => {
      const child = jsx('span', { children: 'child' });
      const parent = jsx('div', { children: child });
      expect(parent.children.length).toBe(1);
      expect(parent.children[0]).toBe(child);
    });

    it('should append multiple children', () => {
      const el = jsx('ul', {
        children: [jsx('li', { children: 'Item 1' }), jsx('li', { children: 'Item 2' })],
      });
      expect(el.children.length).toBe(2);
      expect(el.children[0].textContent).toBe('Item 1');
      expect(el.children[1].textContent).toBe('Item 2');
    });

    it('should filter out null, undefined, false, true children', () => {
      const el = jsx('div', {
        children: [null, undefined, false, true, 'visible'],
      });
      expect(el.textContent).toBe('visible');
      expect(el.childNodes.length).toBe(1);
    });

    it('should flatten nested arrays', () => {
      const el = jsx('div', {
        children: [
          ['a', 'b'],
          ['c', 'd'],
        ],
      });
      expect(el.textContent).toBe('abcd');
      expect(el.childNodes.length).toBe(4); // 4 text nodes
    });

    it('should convert numbers to text nodes', () => {
      const el = jsx('span', { children: 42 });
      expect(el.textContent).toBe('42');
    });

    it('should attach event handlers', () => {
      let clicked = false;
      const onClick = () => {
        clicked = true;
      };
      const el = jsx('button', { onClick, children: 'Click me' });

      el.dispatchEvent(new MouseEvent('click'));
      expect(clicked).toBe(true);
    });

    it('should normalize event handler names', () => {
      let keyPressed = false;
      const onKeyDown = () => {
        keyPressed = true;
      };
      const el = jsx('input', { onKeyDown });

      el.dispatchEvent(new KeyboardEvent('keydown'));
      expect(keyPressed).toBe(true);
    });

    it('should handle boolean attributes', () => {
      const el = jsx('input', { type: 'checkbox', checked: true });
      expect(el.getAttribute('checked')).toBe('');
    });

    it('should skip false boolean attributes', () => {
      const el = jsx('input', { type: 'checkbox', checked: false });
      expect(el.hasAttribute('checked')).toBe(false);
    });

    it('should handle style attribute as string', () => {
      const el = jsx('div', { style: 'color: red; font-size: 16px' });
      expect(el.getAttribute('style')).toBe('color: red; font-size: 16px');
    });

    it('should skip null and undefined attributes', () => {
      const el = jsx('div', { id: null, class: undefined, title: 'test' });
      expect(el.hasAttribute('id')).toBe(false);
      expect(el.hasAttribute('class')).toBe(false);
      expect(el.getAttribute('title')).toBe('test');
    });
  });

  describe('jsx - function components', () => {
    it('should call function components with props', () => {
      const MyComponent = (props: { name: string }) => {
        return jsx('div', { children: `Hello, ${props.name}!` });
      };

      const el = jsx(MyComponent, { name: 'World' });
      expect(el).toBeInstanceOf(HTMLDivElement);
      expect(el.textContent).toBe('Hello, World!');
    });

    it('should pass children to function components', () => {
      const Wrapper = (props: { children: unknown }) => {
        return jsx('section', { class: 'wrapper', children: props.children });
      };

      const el = jsx(Wrapper, { children: 'Content' });
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('wrapper');
      expect(el.textContent).toBe('Content');
    });

    it('should handle nested function components', () => {
      const Inner = () => jsx('span', { children: 'inner' });
      const Outer = () => jsx('div', { children: jsx(Inner, {}) });

      const el = jsx(Outer, {});
      expect(el.children.length).toBe(1);
      expect(el.children[0].textContent).toBe('inner');
    });
  });

  describe('jsxs', () => {
    it('should work the same as jsx', () => {
      const el = jsxs('div', { children: ['a', 'b', 'c'] });
      expect(el.textContent).toBe('abc');
    });
  });

  describe('jsxDEV', () => {
    it('should work the same as jsx', () => {
      const el = jsxDEV('div', { id: 'dev' });
      expect(el.getAttribute('id')).toBe('dev');
    });
  });

  describe('Fragment', () => {
    it('should create a DocumentFragment', () => {
      const frag = Fragment({ children: ['a', 'b'] });
      expect(frag).toBeInstanceOf(DocumentFragment);
    });

    it('should hold multiple children', () => {
      const frag = Fragment({
        children: [jsx('div', { children: 'first' }), jsx('span', { children: 'second' })],
      });
      expect(frag.childNodes.length).toBe(2);
    });

    it('should work with jsx()', () => {
      const frag = jsx(Fragment, { children: ['a', 'b'] });
      expect(frag).toBeInstanceOf(DocumentFragment);
    });
  });

  describe('thunked children', () => {
    it('resolves function children to text', () => {
      const el = jsx('div', { children: () => 'text' });
      expect(el.textContent).toBe('text');
    });

    it('resolves function children to element', () => {
      const child = jsx('span', { children: 'inner' });
      const el = jsx('div', { children: () => child });
      expect(el.children.length).toBe(1);
      expect(el.children[0]).toBe(child);
    });

    it('resolves function children for components', () => {
      const MyComp = (props: { children: unknown }) => {
        return jsx('div', { children: props.children });
      };
      const el = jsx(MyComp, { children: () => jsx('span', {}) });
      expect(el.querySelector('span')).toBeInstanceOf(HTMLSpanElement);
    });
  });

  describe('edge cases', () => {
    it('should handle empty props object', () => {
      const el = jsx('div', {});
      expect(el).toBeInstanceOf(HTMLDivElement);
      expect(el.childNodes.length).toBe(0);
    });

    it('should handle props without children', () => {
      const el = jsx('img', { src: '/image.png', alt: 'Test' });
      expect(el.getAttribute('src')).toBe('/image.png');
      expect(el.getAttribute('alt')).toBe('Test');
    });

    it('should handle deeply nested children', () => {
      const el = jsx('div', {
        children: [
          jsx('div', {
            children: [jsx('span', { children: 'deep' })],
          }),
        ],
      });
      expect(el.querySelector('span')?.textContent).toBe('deep');
    });
  });
});
