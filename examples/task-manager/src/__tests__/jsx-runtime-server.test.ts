/**
 * Unit tests for server-side JSX runtime.
 * 
 * The server runtime must produce VNode objects compatible with @vertz/ui-server,
 * not DOM nodes.
 */

import { describe, expect, test } from 'bun:test';
import { jsx, jsxs, Fragment } from '../jsx-runtime-server';
import type { VNode } from '@vertz/ui-server';

describe('jsx-runtime-server', () => {
  test('creates VNode for simple element', () => {
    const vnode = jsx('div', { class: 'foo', children: 'Hello' }) as VNode;
    
    expect(vnode.tag).toBe('div');
    expect(vnode.attrs).toEqual({ class: 'foo' });
    expect(vnode.children).toEqual(['Hello']);
  });

  test('creates VNode for element with multiple children', () => {
    const vnode = jsxs('ul', { 
      children: [
        jsx('li', { children: 'Item 1' }),
        jsx('li', { children: 'Item 2' }),
      ] 
    }) as VNode;
    
    expect(vnode.tag).toBe('ul');
    expect(vnode.children).toHaveLength(2);
    expect((vnode.children[0] as VNode).tag).toBe('li');
    expect((vnode.children[1] as VNode).tag).toBe('li');
  });

  test('strips event handlers from props', () => {
    const vnode = jsx('button', { 
      onClick: () => console.log('clicked'),
      onKeyDown: () => console.log('key'),
      children: 'Click me',
    }) as VNode;
    
    expect(vnode.attrs).toEqual({});
    expect(vnode.attrs.onClick).toBeUndefined();
    expect(vnode.attrs.onKeyDown).toBeUndefined();
  });

  test('preserves data attributes', () => {
    const vnode = jsx('div', { 
      'data-testid': 'my-div',
      'data-value': '123',
      children: 'content',
    }) as VNode;
    
    expect(vnode.attrs['data-testid']).toBe('my-div');
    expect(vnode.attrs['data-value']).toBe('123');
  });

  test('handles boolean attributes correctly', () => {
    const vnode = jsx('input', { 
      type: 'checkbox',
      checked: true,
      disabled: false,
      required: true,
    }) as VNode;
    
    expect(vnode.attrs.type).toBe('checkbox');
    expect(vnode.attrs.checked).toBe('');
    expect(vnode.attrs.disabled).toBeUndefined();
    expect(vnode.attrs.required).toBe('');
  });

  test('calls component functions and returns their VNode', () => {
    const Component = (props: { text: string }) => 
      jsx('span', { class: 'component', children: props.text });
    
    const vnode = jsx(Component, { text: 'Hello from component' }) as VNode;
    
    expect(vnode.tag).toBe('span');
    expect(vnode.attrs.class).toBe('component');
    expect(vnode.children).toEqual(['Hello from component']);
  });

  test('handles nested component calls', () => {
    const Inner = (props: { value: string }) => 
      jsx('span', { children: props.value });
    
    const Outer = (props: { label: string }) => 
      jsx('div', { 
        class: 'outer',
        children: jsx(Inner, { value: props.label }),
      });
    
    const vnode = jsx(Outer, { label: 'Test' }) as VNode;
    
    expect(vnode.tag).toBe('div');
    expect(vnode.attrs.class).toBe('outer');
    expect((vnode.children[0] as VNode).tag).toBe('span');
    expect((vnode.children[0] as VNode).children).toEqual(['Test']);
  });

  test('handles Fragment', () => {
    const vnode = Fragment({ 
      children: [
        jsx('div', { children: 'First' }),
        jsx('div', { children: 'Second' }),
      ] 
    }) as VNode;
    
    expect(vnode.tag).toBe('fragment');
    expect(vnode.attrs).toEqual({});
    expect(vnode.children).toHaveLength(2);
  });

  test('normalizes null and undefined children', () => {
    const vnode = jsx('div', { 
      children: [null, 'text', undefined, false, true] 
    }) as VNode;
    
    expect(vnode.children).toEqual(['text']);
  });

  test('flattens nested arrays of children', () => {
    const vnode = jsx('div', { 
      children: [
        'a',
        ['b', 'c'],
        [['d', 'e']],
      ] 
    }) as VNode;
    
    expect(vnode.children).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('converts non-string primitives to strings', () => {
    const vnode = jsx('div', { 
      children: [42, true, false, null] 
    }) as VNode;
    
    // true, false, null get filtered out; 42 becomes '42'
    expect(vnode.children).toEqual(['42']);
  });

  test('preserves aria attributes', () => {
    const vnode = jsx('button', { 
      'aria-label': 'Close',
      'aria-expanded': 'true',
      children: 'X',
    }) as VNode;
    
    expect(vnode.attrs['aria-label']).toBe('Close');
    expect(vnode.attrs['aria-expanded']).toBe('true');
  });

  test('handles style attribute as string', () => {
    const vnode = jsx('div', { 
      style: 'color: red; font-size: 16px',
      children: 'Styled',
    }) as VNode;
    
    expect(vnode.attrs.style).toBe('color: red; font-size: 16px');
  });
});
