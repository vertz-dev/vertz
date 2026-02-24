import { describe, expect, it } from 'vitest';
import { SSRElement } from '../dom-shim/ssr-element';
import { SSRDocumentFragment } from '../dom-shim/ssr-fragment';
import { SSRTextNode } from '../dom-shim/ssr-text-node';
import { createSSRAdapter } from '../ssr-adapter';

/** The brand symbol used by the adapter — matches RENDER_NODE_BRAND */
const BRAND = Symbol.for('vertz:render-node');

describe('createSSRAdapter', () => {
  it('createElement returns an SSRElement with the given tag', () => {
    const adapter = createSSRAdapter();
    const el = adapter.createElement('div');
    expect(el).toBeInstanceOf(SSRElement);
    expect((el as SSRElement).tag).toBe('div');
  });

  it('createTextNode returns an SSRTextNode with the given text', () => {
    const adapter = createSSRAdapter();
    const text = adapter.createTextNode('hello');
    expect(text).toBeInstanceOf(SSRTextNode);
    expect(text.data).toBe('hello');
  });

  it('createComment returns an SSRTextNode (comments invisible in SSR)', () => {
    const adapter = createSSRAdapter();
    const comment = adapter.createComment('test');
    expect(comment).toBeInstanceOf(SSRTextNode);
  });

  it('createDocumentFragment returns an SSRDocumentFragment', () => {
    const adapter = createSSRAdapter();
    const fragment = adapter.createDocumentFragment();
    expect(fragment).toBeInstanceOf(SSRDocumentFragment);
  });

  it('isNode returns true for SSR nodes via brand', () => {
    const adapter = createSSRAdapter();
    expect(adapter.isNode(new SSRElement('div'))).toBe(true);
    expect(adapter.isNode(new SSRTextNode('text'))).toBe(true);
    expect(adapter.isNode(new SSRDocumentFragment())).toBe(true);
  });

  it('isNode returns false for plain objects', () => {
    const adapter = createSSRAdapter();
    expect(adapter.isNode({})).toBe(false);
    expect(adapter.isNode(null)).toBe(false);
    expect(adapter.isNode('text')).toBe(false);
  });

  it('SSR nodes have RENDER_NODE_BRAND on their prototype', () => {
    createSSRAdapter();
    const el = new SSRElement('span');
    expect(BRAND in el).toBe(true);
  });
});
