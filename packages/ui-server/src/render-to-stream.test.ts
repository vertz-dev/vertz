import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStream } from './render-to-stream';
import { resetSlotCounter } from './slot-placeholder';
import { streamToString } from './streaming';
import type { RawHtml, VNode } from './types';

beforeEach(() => {
  resetSlotCounter();
});

describe('renderToStream', () => {
  it('renders a simple text node', async () => {
    const html = await streamToString(renderToStream('Hello'));
    expect(html).toBe('Hello');
  });

  it('escapes text content', async () => {
    const html = await streamToString(renderToStream('<b>bold</b>'));
    expect(html).toBe('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('renders a RawHtml node without escaping', async () => {
    const raw: RawHtml = { __raw: true, html: '<b>bold</b>' };
    const html = await streamToString(renderToStream(raw));
    expect(html).toBe('<b>bold</b>');
  });

  it('renders a VNode with attributes', async () => {
    const node: VNode = {
      tag: 'div',
      attrs: { class: 'test', id: 'main' },
      children: ['content'],
    };
    const html = await streamToString(renderToStream(node));
    expect(html).toBe('<div class="test" id="main">content</div>');
  });

  it('renders void elements without closing tag', async () => {
    const node: VNode = {
      tag: 'br',
      attrs: {},
      children: [],
    };
    const html = await streamToString(renderToStream(node));
    expect(html).toBe('<br>');
  });

  it('does not escape raw text inside script/style', async () => {
    const node: VNode = {
      tag: 'script',
      attrs: {},
      children: ['var x = 1 < 2;'],
    };
    const html = await streamToString(renderToStream(node));
    expect(html).toBe('<script>var x = 1 < 2;</script>');
  });

  it('handles Suspense boundaries with async resolution', async () => {
    const suspenseNode: VNode & {
      _fallback: VNode | string;
      _resolve: Promise<VNode | string>;
    } = {
      tag: '__suspense',
      attrs: {},
      children: [],
      _fallback: 'Loading...',
      _resolve: Promise.resolve('Resolved content'),
    };
    const html = await streamToString(renderToStream(suspenseNode));
    expect(html).toContain('v-slot-0');
    expect(html).toContain('Loading...');
    expect(html).toContain('Resolved content');
  });

  it('emits error placeholder when Suspense promise rejects', async () => {
    const suspenseNode: VNode & {
      _fallback: VNode | string;
      _resolve: Promise<VNode | string>;
    } = {
      tag: '__suspense',
      attrs: {},
      children: [],
      _fallback: 'Loading...',
      _resolve: Promise.reject(new Error('fetch failed')),
    };
    const html = await streamToString(renderToStream(suspenseNode));
    // Stream should complete without throwing
    expect(html).toContain('v-slot-0');
    // Should contain an error placeholder instead of crashing
    expect(html).toContain('v-ssr-error');
  });

  it('keeps stream alive when one of multiple Suspense boundaries rejects', async () => {
    const root: VNode = {
      tag: 'div',
      attrs: {},
      children: [
        {
          tag: '__suspense',
          attrs: {},
          children: [],
          _fallback: 'Loading A...',
          _resolve: Promise.resolve('Content A'),
        } as VNode & { _fallback: string; _resolve: Promise<string> },
        {
          tag: '__suspense',
          attrs: {},
          children: [],
          _fallback: 'Loading B...',
          _resolve: Promise.reject(new Error('B failed')),
        } as VNode & { _fallback: string; _resolve: Promise<string> },
      ],
    };
    const html = await streamToString(renderToStream(root));
    // Stream completes without throwing
    expect(html).toContain('Content A');
    expect(html).toContain('v-ssr-error');
  });
});

describe('renderToStream deduplication', () => {
  it('does not re-define VOID_ELEMENTS or RAW_TEXT_ELEMENTS locally', async () => {
    // This is a structural test — we verify that the module imports shared
    // constants from html-serializer instead of defining its own.
    // We read the source file and check for duplicate definitions.
    const fs = await import('node:fs');
    const source = fs.readFileSync(new URL('./render-to-stream.ts', import.meta.url), 'utf-8');

    // Should NOT define VOID_ELEMENTS locally
    expect(source).not.toMatch(/^const VOID_ELEMENTS/m);
    // Should NOT define RAW_TEXT_ELEMENTS locally
    expect(source).not.toMatch(/^const RAW_TEXT_ELEMENTS/m);
    // Should NOT define escapeAttr locally
    expect(source).not.toMatch(/^function escapeAttr/m);
    // Should NOT define isRawHtml locally
    expect(source).not.toMatch(/^function isRawHtml/m);
  });
});
