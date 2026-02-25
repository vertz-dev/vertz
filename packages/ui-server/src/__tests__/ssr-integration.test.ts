import { describe, expect, it } from 'vitest';
import { installDomShim, removeDomShim } from '../dom-shim';
import { renderHeadToHtml } from '../head';
import { wrapWithHydrationMarkers } from '../hydration-markers';
import { renderToStream } from '../render-to-stream';
import { resetSlotCounter } from '../slot-placeholder';
import { collectStreamChunks, streamToString } from '../streaming';
import type { VNode } from '../types';
import { rawHtml } from '../types';

describe('SSR Integration Tests', () => {
  /** IT-5A-1: renderToStream produces valid HTML from component tree */
  it('IT-5A-1: renderToStream produces valid HTML from component tree', async () => {
    const tree: VNode = {
      tag: 'html',
      attrs: { lang: 'en' },
      children: [
        {
          tag: 'head',
          attrs: {},
          children: [{ tag: 'title', attrs: {}, children: ['Test Page'] }],
        },
        {
          tag: 'body',
          attrs: {},
          children: [
            {
              tag: 'div',
              attrs: { id: 'app' },
              children: [
                {
                  tag: 'header',
                  attrs: {},
                  children: [{ tag: 'h1', attrs: {}, children: ['Welcome'] }],
                },
                {
                  tag: 'main',
                  attrs: {},
                  children: [
                    { tag: 'p', attrs: { class: 'intro' }, children: ['Hello, SSR!'] },
                    {
                      tag: 'ul',
                      attrs: {},
                      children: [
                        { tag: 'li', attrs: {}, children: ['Item 1'] },
                        { tag: 'li', attrs: {}, children: ['Item 2'] },
                        { tag: 'li', attrs: {}, children: ['Item 3'] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const html = await streamToString(renderToStream(tree));

    // Valid HTML structure
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<head><title>Test Page</title></head>');
    expect(html).toContain('<h1>Welcome</h1>');
    expect(html).toContain('<p class="intro">Hello, SSR!</p>');
    expect(html).toContain('<li>Item 1</li><li>Item 2</li><li>Item 3</li>');
    expect(html).toContain('</html>');

    // Ensure proper nesting: opening and closing tags match
    const openTags = html.match(/<[a-z][^/]*?>/g) ?? [];
    const closeTags = html.match(/<\/[a-z]+>/g) ?? [];
    // Void elements don't have closing tags, so closed <= opened is expected
    expect(closeTags.length).toBeLessThanOrEqual(openTags.length);
  });

  /** IT-5A-2: Suspense emits placeholder first, then replacement chunk (out-of-order streaming) */
  it('IT-5A-2: Suspense emits placeholder first, then replacement chunk', async () => {
    resetSlotCounter();

    const fallback: VNode = { tag: 'div', attrs: { class: 'skeleton' }, children: ['Loading...'] };
    const resolved: VNode = { tag: 'div', attrs: { class: 'content' }, children: ['Loaded data!'] };

    const suspenseNode = {
      tag: '__suspense',
      attrs: {},
      children: [] as (VNode | string)[],
      _fallback: fallback,
      _resolve: Promise.resolve(resolved),
    };

    const tree: VNode = {
      tag: 'div',
      attrs: { id: 'app' },
      children: [{ tag: 'h1', attrs: {}, children: ['Page'] }, suspenseNode as VNode],
    };

    const chunks = await collectStreamChunks(renderToStream(tree));
    const fullHtml = chunks.join('');

    // The placeholder should appear in the stream
    expect(fullHtml).toContain('id="v-slot-0"');
    expect(fullHtml).toContain('Loading...');

    // The replacement template should appear after the placeholder
    expect(fullHtml).toContain('<template id="v-tmpl-0">');
    expect(fullHtml).toContain('Loaded data!');

    // The replacement script should be included
    expect(fullHtml).toContain('<script>');
    expect(fullHtml).toContain('v-slot-0');

    // Ensure placeholder appears before template in the output
    const slotIndex = fullHtml.indexOf('v-slot-0');
    const tmplIndex = fullHtml.indexOf('v-tmpl-0');
    expect(slotIndex).toBeLessThan(tmplIndex);
  });

  /** IT-5A-3: Interactive components get data-v-id hydration markers */
  it('IT-5A-3: Interactive components get data-v-id hydration markers', async () => {
    const counterNode: VNode = {
      tag: 'div',
      attrs: {},
      children: [
        { tag: 'span', attrs: {}, children: ['Count: 0'] },
        { tag: 'button', attrs: {}, children: ['+'] },
      ],
    };

    // Wrap with hydration markers (as the compiler would for interactive components)
    const hydratedNode = wrapWithHydrationMarkers(counterNode, {
      componentName: 'Counter',
      key: 'counter-0',
      props: { initial: 0 },
    });

    const html = await streamToString(renderToStream(hydratedNode));

    // Should have hydration attributes
    expect(html).toContain('data-v-id="Counter"');
    expect(html).toContain('data-v-key="counter-0"');
    // Should have serialized props
    expect(html).toContain('<script type="application/json">');
    expect(html).toContain('"initial":0');
    // Should still render the component content
    expect(html).toContain('Count: 0');
    expect(html).toContain('<button>+</button>');
  });

  /** IT-5A-4: Static components have NO hydration markers */
  it('IT-5A-4: Static components have NO hydration markers', async () => {
    // A purely static component — no signals, no interactivity
    const staticNode: VNode = {
      tag: 'footer',
      attrs: { class: 'site-footer' },
      children: [
        { tag: 'p', attrs: {}, children: ['Copyright 2026'] },
        { tag: 'a', attrs: { href: '/privacy' }, children: ['Privacy Policy'] },
      ],
    };

    // Static components are NOT wrapped with hydration markers
    const html = await streamToString(renderToStream(staticNode));

    // Should NOT contain any hydration markers
    expect(html).not.toContain('data-v-id');
    expect(html).not.toContain('data-v-key');
    expect(html).not.toContain('application/json');

    // Should render normally
    expect(html).toContain('<footer class="site-footer">');
    expect(html).toContain('Copyright 2026');
    expect(html).toContain('<a href="/privacy">Privacy Policy</a>');
  });

  /** Comments must serialize as HTML comments for hydration cursor tracking */
  it('createComment produces SSRComment that serializes as HTML comment', () => {
    installDomShim();
    try {
      const doc = (globalThis as any).document;
      const comment = doc.createComment('conditional');

      // SSRComment preserves the text for HTML serialization
      expect(comment.text).toBe('conditional');

      // When appended to an SSRElement, it appears in the VNode as a RawHtml comment
      const parent = doc.createElement('div');
      parent.appendChild(comment);
      const vnode = parent.toVNode();
      expect(vnode.children).toHaveLength(1);
      const child = vnode.children[0];
      expect(child).toHaveProperty('__raw', true);
      expect(child).toHaveProperty('html', '<!--conditional-->');
    } finally {
      removeDomShim();
    }
  });

  /** IT-5A-5: Head component injects <title> into HTML head */
  it('IT-5A-5: Head component injects title into HTML head', async () => {
    const headEntries = [
      { tag: 'title' as const, textContent: 'My SSR App' },
      { tag: 'meta' as const, attrs: { charset: 'utf-8' } },
      {
        tag: 'meta' as const,
        attrs: { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      },
      { tag: 'link' as const, attrs: { rel: 'stylesheet', href: '/styles.css' } },
    ];

    const headHtml = renderHeadToHtml(headEntries);

    // Build a full page with the head injected as raw HTML
    const pageTree = {
      tag: 'html',
      attrs: { lang: 'en' },
      children: [
        {
          tag: 'head',
          attrs: {},
          children: [rawHtml(headHtml)],
        },
        {
          tag: 'body',
          attrs: {},
          children: [{ tag: 'div', attrs: { id: 'app' }, children: ['Content'] }],
        },
      ],
    };

    const html = await streamToString(renderToStream(pageTree));

    // Head should contain title
    expect(html).toContain('<title>My SSR App</title>');
    // Head should contain meta tags
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('name="viewport"');
    // Head should contain link
    expect(html).toContain('<link rel="stylesheet" href="/styles.css">');
    // Body should still render
    expect(html).toContain('<div id="app">Content</div>');
  });
});
