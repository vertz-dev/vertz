import { describe, expect, it } from 'vitest';
import type { VNode } from '../../types';
import { Fragment, jsx, jsxDEV, jsxs } from '../index';

describe('JSX Runtime (Server)', () => {
  describe('jsx - intrinsic elements', () => {
    it('should create a VNode with tag and attrs', () => {
      const result = jsx('div', { id: 'test', class: 'container' });
      expect(result).toEqual({
        tag: 'div',
        attrs: { id: 'test', class: 'container' },
        children: [],
      });
    });

    it('should handle children as a single string', () => {
      const result = jsx('p', { children: 'Hello, world!' });
      expect(result).toEqual({
        tag: 'p',
        attrs: {},
        children: ['Hello, world!'],
      });
    });

    it('should handle children as an array', () => {
      const result = jsx('ul', {
        children: [jsx('li', { children: 'Item 1' }), jsx('li', { children: 'Item 2' })],
      });
      expect(result.tag).toBe('ul');
      expect(result.children).toHaveLength(2);
      expect((result.children[0] as VNode).tag).toBe('li');
    });

    it('should filter out null, undefined, false, true children', () => {
      const result = jsx('div', {
        children: [null, undefined, false, true, 'visible'],
      });
      expect(result.children).toEqual(['visible']);
    });

    it('should flatten nested arrays', () => {
      const result = jsx('div', {
        children: [
          ['a', 'b'],
          ['c', 'd'],
        ],
      });
      expect(result.children).toEqual(['a', 'b', 'c', 'd']);
    });

    it('should convert numbers to strings', () => {
      const result = jsx('span', { children: 42 });
      expect(result.children).toEqual(['42']);
    });

    it('should skip event handler props', () => {
      const onClick = () => {};
      const result = jsx('button', { onClick, children: 'Click me' });
      expect(result.attrs).not.toHaveProperty('onClick');
      expect(result.children).toEqual(['Click me']);
    });

    it('should handle boolean attributes', () => {
      const result = jsx('input', { type: 'checkbox', checked: true });
      expect(result.attrs).toEqual({
        type: 'checkbox',
        checked: '',
      });
    });

    it('should skip false boolean attributes', () => {
      const result = jsx('input', { type: 'checkbox', checked: false });
      expect(result.attrs).toEqual({ type: 'checkbox' });
    });

    it('should handle style attribute as string', () => {
      const result = jsx('div', { style: 'color: red; font-size: 16px' });
      expect(result.attrs).toEqual({
        style: 'color: red; font-size: 16px',
      });
    });

    it('should skip null and undefined attributes', () => {
      const result = jsx('div', { id: null, class: undefined, title: 'test' });
      expect(result.attrs).toEqual({ title: 'test' });
    });
  });

  describe('jsx - function components', () => {
    it('should call function components with props', () => {
      const MyComponent = (props: { name: string }) => {
        return jsx('div', { children: `Hello, ${props.name}!` });
      };

      const result = jsx(MyComponent, { name: 'World' });
      expect(result).toEqual({
        tag: 'div',
        attrs: {},
        children: ['Hello, World!'],
      });
    });

    it('should pass children to function components', () => {
      const Wrapper = (props: { children: unknown }) => {
        return jsx('section', { class: 'wrapper', children: props.children });
      };

      const result = jsx(Wrapper, { children: 'Content' });
      expect(result).toEqual({
        tag: 'section',
        attrs: { class: 'wrapper' },
        children: ['Content'],
      });
    });

    it('should handle nested function components', () => {
      const Inner = () => jsx('span', { children: 'inner' });
      const Outer = () => jsx('div', { children: jsx(Inner, {}) });

      const result = jsx(Outer, {});
      expect(result).toEqual({
        tag: 'div',
        attrs: {},
        children: [
          {
            tag: 'span',
            attrs: {},
            children: ['inner'],
          },
        ],
      });
    });
  });

  describe('jsxs', () => {
    it('should work the same as jsx', () => {
      const result = jsxs('div', { children: ['a', 'b', 'c'] });
      expect(result).toEqual({
        tag: 'div',
        attrs: {},
        children: ['a', 'b', 'c'],
      });
    });
  });

  describe('jsxDEV', () => {
    it('should work the same as jsx', () => {
      const result = jsxDEV('div', { id: 'dev' });
      expect(result).toEqual({
        tag: 'div',
        attrs: { id: 'dev' },
        children: [],
      });
    });
  });

  describe('Fragment', () => {
    it('should create a fragment VNode', () => {
      const result = Fragment({ children: ['a', 'b'] });
      expect(result).toEqual({
        tag: 'fragment',
        attrs: {},
        children: ['a', 'b'],
      });
    });

    it('should work with jsx()', () => {
      const result = jsx(Fragment, { children: ['a', 'b'] });
      expect(result).toEqual({
        tag: 'fragment',
        attrs: {},
        children: ['a', 'b'],
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty props object', () => {
      const result = jsx('div', {});
      expect(result).toEqual({
        tag: 'div',
        attrs: {},
        children: [],
      });
    });

    it('should handle props without children', () => {
      const result = jsx('img', { src: '/image.png', alt: 'Test' });
      expect(result).toEqual({
        tag: 'img',
        attrs: { src: '/image.png', alt: 'Test' },
        children: [],
      });
    });

    it('should handle deeply nested children', () => {
      const result = jsx('div', {
        children: [
          jsx('div', {
            children: [jsx('span', { children: 'deep' })],
          }),
        ],
      });
      expect(result.tag).toBe('div');
      expect((result.children[0] as VNode).tag).toBe('div');
      expect(((result.children[0] as VNode).children[0] as VNode).tag).toBe('span');
    });
  });
});
