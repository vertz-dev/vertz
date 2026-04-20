import { describe, expect, it } from '@vertz/test';
import { jsx } from '../jsx-runtime/index';
import { renderToStream } from '../render-to-stream';
import { streamToString } from '../streaming';

// Regression guard: the Vertz reactive compiler passes children as
// getter functions — e.g., `<Select.Item>Apple</Select.Item>` compiles to
// `Select.Item({ children: () => __staticText("Apple") })`. ui-primitives'
// libraries are compiled with the classic automatic JSX transform, so their
// internal calls land in this server runtime. `normalizeChildren` must
// invoke function children (like the client runtime does) — otherwise SSR
// emits the function's source code as literal text, which survives
// hydration and ships as visible garbage like `() => __staticText("Apple")`.
describe('Server JSX Runtime — reactive getter children', () => {
  it('invokes function children instead of stringifying them', () => {
    const vnode = jsx('div', { children: () => 'Apple' });
    expect(vnode.children).toEqual(['Apple']);
  });

  it('invokes function children that return VNodes', () => {
    const child = jsx('span', { children: 'inner' });
    const vnode = jsx('div', { children: () => child });
    expect(vnode.children).toEqual([child]);
  });

  it('invokes function children inside arrays (children ?? value pattern)', () => {
    const vnode = jsx('div', { children: [() => 'Apple', jsx('span', { children: 'icon' })] });
    expect(vnode.children[0]).toBe('Apple');
    expect((vnode.children[1] as { tag: string }).tag).toBe('span');
  });

  it('unwraps nested thunks (thunk returning a thunk)', () => {
    const vnode = jsx('div', { children: () => () => 'Deep' });
    expect(vnode.children).toEqual(['Deep']);
  });

  it('renders function children to correct HTML via renderToStream (E2E guard)', async () => {
    const vnode = jsx('div', {
      role: 'option',
      children: [() => 'Apple', jsx('span', { 'data-part': 'indicator' })],
    });
    const html = await streamToString(renderToStream(vnode));
    expect(html).toBe('<div role="option">Apple<span data-part="indicator"></span></div>');
    expect(html).not.toContain('=>');
    expect(html).not.toContain('function');
  });

  it('caps recursion to catch circular thunks instead of hanging', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional circular thunk
    const cyclic: any = () => cyclic;
    expect(() => jsx('div', { children: cyclic })).toThrow(/max thunk depth/);
  });
});

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
