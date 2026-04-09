import { describe, expect, it } from '@vertz/test';
import { h } from '../h';

describe('h (JSX factory)', () => {
  it('creates an element with type and props', () => {
    const el = h('div', { style: { color: 'red' } });
    expect(el.type).toBe('div');
    expect(el.props.style).toEqual({ color: 'red' });
  });

  it('passes a single string child directly (not wrapped in array)', () => {
    const el = h('div', null, 'hello');
    expect(el.props.children).toBe('hello');
  });

  it('wraps multiple children in an array', () => {
    const a = h('span', null, 'a');
    const b = h('span', null, 'b');
    const el = h('div', null, a, b);
    expect(el.props.children).toEqual([a, b]);
  });

  it('filters out null, undefined, and false children', () => {
    const child = h('span', null, 'keep');
    const el = h('div', null, null, child, undefined, false);
    expect(el.props.children).toBe(child);
  });

  it('omits children when none are provided', () => {
    const el = h('div', { style: { display: 'flex' } });
    expect(el.props.children).toBeUndefined();
  });

  it('handles null props', () => {
    const el = h('div', null, 'text');
    expect(el.type).toBe('div');
    expect(el.props.children).toBe('text');
  });

  it('preserves non-style props like src and width', () => {
    const el = h('img', { src: 'data:image/png;base64,...', width: 100 });
    expect(el.props.src).toBe('data:image/png;base64,...');
    expect(el.props.width).toBe(100);
  });
});
