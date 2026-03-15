import { describe, expect, it } from 'bun:test';
import { jsx } from '../jsx-runtime/index';

describe('Server JSX Runtime — className support', () => {
  it('should map className to class attribute in VNode attrs', () => {
    const vnode = jsx('div', { className: 'wrapper' });
    expect(vnode.attrs.class).toBe('wrapper');
    expect(vnode.attrs).not.toHaveProperty('className');
  });

  it('should still support deprecated class prop', () => {
    const vnode = jsx('div', { class: 'container' });
    expect(vnode.attrs.class).toBe('container');
  });

  it('should give className precedence when both are present', () => {
    const vnode = jsx('div', { className: 'primary', class: 'secondary' });
    expect(vnode.attrs.class).toBe('primary');
    expect(vnode.attrs).not.toHaveProperty('className');
  });
});
