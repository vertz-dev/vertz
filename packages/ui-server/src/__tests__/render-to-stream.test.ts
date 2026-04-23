import { describe, expect, it } from '@vertz/test';
import { jsx } from '../jsx-runtime';
import { renderToStream } from '../render-to-stream';
import { collectStreamChunks, streamToString } from '../streaming';
import type { VNode } from '../types';

describe('renderToStream', () => {
  it('renders a simple VNode tree to HTML', async () => {
    const tree: VNode = {
      tag: 'div',
      attrs: { class: 'app' },
      children: [
        { tag: 'h1', attrs: {}, children: ['Hello'] },
        { tag: 'p', attrs: {}, children: ['World'] },
      ],
    };
    const html = await streamToString(renderToStream(tree));
    expect(html).toBe('<div class="app"><h1>Hello</h1><p>World</p></div>');
  });

  it('streams content in chunks', async () => {
    const tree: VNode = {
      tag: 'div',
      attrs: {},
      children: [
        { tag: 'p', attrs: {}, children: ['one'] },
        { tag: 'p', attrs: {}, children: ['two'] },
      ],
    };
    const chunks = await collectStreamChunks(renderToStream(tree));
    // Should produce at least one chunk
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.join('')).toBe('<div><p>one</p><p>two</p></div>');
  });

  it('renders a string node', async () => {
    const html = await streamToString(renderToStream('just text'));
    expect(html).toBe('just text');
  });

  it('handles an empty tree', async () => {
    const tree: VNode = { tag: 'div', attrs: {}, children: [] };
    const html = await streamToString(renderToStream(tree));
    expect(html).toBe('<div></div>');
  });

  it('renders void elements without closing tag', async () => {
    const tree: VNode = {
      tag: 'div',
      attrs: {},
      children: [
        { tag: 'input', attrs: { type: 'text' }, children: [] },
        { tag: 'br', attrs: {}, children: [] },
      ],
    };
    const html = await streamToString(renderToStream(tree));
    expect(html).toBe('<div><input type="text"><br></div>');
  });

  it('renders fragment nodes by flattening children without a wrapper tag', async () => {
    const tree: VNode = {
      tag: 'div',
      attrs: {},
      children: [
        {
          tag: 'fragment',
          attrs: {},
          children: [
            { tag: 'p', attrs: {}, children: ['first'] },
            { tag: 'p', attrs: {}, children: ['second'] },
          ],
        },
      ],
    };
    const html = await streamToString(renderToStream(tree));
    expect(html).toBe('<div><p>first</p><p>second</p></div>');
  });

  it('renders top-level fragment without wrapper', async () => {
    const tree: VNode = {
      tag: 'fragment',
      attrs: {},
      children: [
        { tag: 'h1', attrs: {}, children: ['Title'] },
        { tag: 'p', attrs: {}, children: ['Content'] },
      ],
    };
    const html = await streamToString(renderToStream(tree));
    expect(html).toBe('<h1>Title</h1><p>Content</p>');
  });

  describe('signal-like object unwrapping', () => {
    it('unwraps signal-like child to its peeked value', async () => {
      const signal = { value: 'hello', peek: () => 'hello' };
      // Pass signal-like object as child through the JSX runtime
      const vnode = jsx('div', { children: signal });
      const html = await streamToString(renderToStream(vnode));
      expect(html).toContain('hello');
      expect(html).not.toContain('[object Object]');
    });

    it('unwraps signal-like boolean attribute to its peeked value', async () => {
      const signal = { value: true, peek: () => true };
      // Pass signal-like object as attribute through the JSX runtime
      const vnode = jsx('button', { disabled: signal, children: 'Submit' });
      const html = await streamToString(renderToStream(vnode));
      // Boolean true → empty string attribute (disabled="")
      expect(html).toContain('disabled=""');
      expect(html).not.toContain('[object Object]');
    });

    it('unwraps signal-like string attribute value', async () => {
      const signal = { value: 'error-msg', peek: () => 'error-msg' };
      const vnode = jsx('span', { class: signal, children: 'text' });
      const html = await streamToString(renderToStream(vnode));
      expect(html).toContain('class="error-msg"');
      expect(html).not.toContain('[object Object]');
    });
  });
});
