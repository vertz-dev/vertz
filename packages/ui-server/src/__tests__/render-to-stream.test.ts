import { describe, expect, it } from 'vitest';
import { renderToStream } from '../render-to-stream';
import { resetSlotCounter } from '../slot-placeholder';
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

  it('handles suspense-like async children', async () => {
    resetSlotCounter();
    const resolvedContent: VNode = { tag: 'p', attrs: {}, children: ['loaded'] };
    const fallbackContent: VNode = { tag: 'span', attrs: {}, children: ['loading...'] };

    const suspenseTree = {
      tag: '__suspense',
      attrs: {},
      children: [] as (VNode | string)[],
      _fallback: fallbackContent,
      _resolve: Promise.resolve(resolvedContent),
    };

    const html = await streamToString(
      renderToStream({ tag: 'div', attrs: {}, children: [suspenseTree] }),
    );

    // Should contain the placeholder
    expect(html).toContain('v-slot-');
    // Should contain the fallback
    expect(html).toContain('loading...');
    // Should contain the replacement template
    expect(html).toContain('v-tmpl-');
    expect(html).toContain('loaded');
  });

  describe('CSP nonce support', () => {
    it('injects nonce attribute on inline scripts when nonce option is provided', async () => {
      resetSlotCounter();
      const resolvedContent: VNode = { tag: 'p', attrs: {}, children: ['loaded'] };
      const fallbackContent: VNode = { tag: 'span', attrs: {}, children: ['loading...'] };

      const suspenseTree = {
        tag: '__suspense',
        attrs: {},
        children: [] as (VNode | string)[],
        _fallback: fallbackContent,
        _resolve: Promise.resolve(resolvedContent),
      };

      const html = await streamToString(
        renderToStream({ tag: 'div', attrs: {}, children: [suspenseTree] }, { nonce: 'abc123' }),
      );

      // The inline replacement script should include the nonce
      expect(html).toContain('<script nonce="abc123">');
      // Should still contain the replacement logic
      expect(html).toContain('v-slot-0');
      expect(html).toContain('v-tmpl-0');
    });

    it('does not include nonce attribute when nonce option is omitted', async () => {
      resetSlotCounter();
      const resolvedContent: VNode = { tag: 'p', attrs: {}, children: ['loaded'] };
      const fallbackContent: VNode = { tag: 'span', attrs: {}, children: ['loading...'] };

      const suspenseTree = {
        tag: '__suspense',
        attrs: {},
        children: [] as (VNode | string)[],
        _fallback: fallbackContent,
        _resolve: Promise.resolve(resolvedContent),
      };

      const html = await streamToString(
        renderToStream({ tag: 'div', attrs: {}, children: [suspenseTree] }),
      );

      // Scripts should NOT have a nonce attribute
      expect(html).toContain('<script>');
      expect(html).not.toContain('nonce=');
    });

    it('does not include nonce attribute when nonce is undefined', async () => {
      resetSlotCounter();
      const resolvedContent: VNode = { tag: 'p', attrs: {}, children: ['loaded'] };
      const fallbackContent: VNode = { tag: 'span', attrs: {}, children: ['loading...'] };

      const suspenseTree = {
        tag: '__suspense',
        attrs: {},
        children: [] as (VNode | string)[],
        _fallback: fallbackContent,
        _resolve: Promise.resolve(resolvedContent),
      };

      const html = await streamToString(
        renderToStream({ tag: 'div', attrs: {}, children: [suspenseTree] }, { nonce: undefined }),
      );

      expect(html).toContain('<script>');
      expect(html).not.toContain('nonce=');
    });

    it('escapes nonce value to prevent XSS via nonce injection', async () => {
      resetSlotCounter();
      const resolvedContent: VNode = { tag: 'p', attrs: {}, children: ['loaded'] };
      const fallbackContent: VNode = { tag: 'span', attrs: {}, children: ['loading...'] };

      const suspenseTree = {
        tag: '__suspense',
        attrs: {},
        children: [] as (VNode | string)[],
        _fallback: fallbackContent,
        _resolve: Promise.resolve(resolvedContent),
      };

      const html = await streamToString(
        renderToStream(
          { tag: 'div', attrs: {}, children: [suspenseTree] },
          { nonce: '"><script>alert(1)</script>' },
        ),
      );

      // The nonce value should be escaped — no unescaped quotes breaking out
      expect(html).not.toContain('"><script>alert(1)</script>');
      // Should still have the nonce attribute with escaped value
      expect(html).toContain('nonce="');
    });
  });
});
