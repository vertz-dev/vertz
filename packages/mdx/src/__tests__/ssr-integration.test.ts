import { describe, expect, it } from '@vertz/test';
import { serializeToHtml } from '@vertz/ui-server';
import { Fragment, jsx, jsxs } from '@vertz/ui-server/jsx-runtime';

/**
 * Helper: compile MDX through the Bun plugin, then evaluate with the server
 * JSX runtime and serialize to HTML.
 *
 * Uses `function-body` output format so we can inject the runtime at eval time
 * without needing import resolution.
 */
async function mdxToHtml(
  mdxSource: string,
  options?: { components?: Record<string, unknown> },
): Promise<string> {
  const { compile } = await import('@mdx-js/mdx');
  const remarkFrontmatter = (await import('remark-frontmatter')).default;
  const remarkMdxFrontmatter = (await import('remark-mdx-frontmatter')).default;

  const compiled = await compile(mdxSource, {
    outputFormat: 'function-body',
    development: false,
    remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter],
  });

  const code = String(compiled);
  const fn = new Function(`"use strict";\n${code}`);
  const mod = fn.call(undefined, {
    jsx,
    jsxs,
    Fragment,
    jsxDEV: jsx,
  });

  const vnode = mod.default(options ?? {});
  return serializeToHtml(vnode);
}

describe('MDX SSR Integration', () => {
  it('renders headings to HTML', async () => {
    const html = await mdxToHtml('# Hello World');
    expect(html).toContain('<h1>Hello World</h1>');
  });

  it('renders paragraphs with inline formatting', async () => {
    const html = await mdxToHtml('A **bold** and *italic* paragraph.');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<p>');
  });

  it('renders unordered lists', async () => {
    const html = await mdxToHtml('- Item one\n- Item two\n- Item three');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>Item one</li>');
    expect(html).toContain('<li>Item two</li>');
    expect(html).toContain('<li>Item three</li>');
  });

  it('renders ordered lists', async () => {
    const html = await mdxToHtml('1. First\n2. Second');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>First</li>');
    expect(html).toContain('<li>Second</li>');
  });

  it('renders inline code', async () => {
    const html = await mdxToHtml('Use `const x = 1` in your code.');
    expect(html).toContain('<code>const x = 1</code>');
  });

  it('renders code fences', async () => {
    const html = await mdxToHtml(`\`\`\`tsx
const x = 1;
\`\`\``);
    expect(html).toContain('<pre>');
    expect(html).toContain('<code');
    expect(html).toContain('const x = 1;');
  });

  it('renders links', async () => {
    const html = await mdxToHtml('Visit [Vertz](https://vertz.dev).');
    expect(html).toContain('<a href="https://vertz.dev">Vertz</a>');
  });

  it('renders multiple sections without fragment tags', async () => {
    const html = await mdxToHtml(`# Section One

Paragraph one.

# Section Two

Paragraph two.`);
    expect(html).toContain('<h1>Section One</h1>');
    expect(html).toContain('<h1>Section Two</h1>');
    expect(html).not.toContain('<fragment>');
    expect(html).not.toContain('</fragment>');
  });

  it('supports component overrides', async () => {
    const customH1 = (props: Record<string, unknown>) => {
      return jsx('div', {
        class: 'doc-heading',
        children: jsx('h1', { children: props.children }),
      });
    };

    const html = await mdxToHtml('# Custom', {
      components: { h1: customH1 },
    });

    expect(html).toContain('<div class="doc-heading">');
    expect(html).toContain('<h1>Custom</h1>');
  });

  it('supports multiple component overrides simultaneously', async () => {
    const customH1 = (props: Record<string, unknown>) =>
      jsx('h1', { class: 'title', children: props.children });
    const customP = (props: Record<string, unknown>) =>
      jsx('p', { class: 'body', children: props.children });

    const html = await mdxToHtml('# Title\n\nBody text.', {
      components: { h1: customH1, p: customP },
    });

    expect(html).toContain('<h1 class="title">Title</h1>');
    expect(html).toContain('<p class="body">Body text.</p>');
  });

  it('renders blockquotes', async () => {
    const html = await mdxToHtml('> This is a quote.');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('This is a quote.');
  });

  it('renders horizontal rules', async () => {
    const html = await mdxToHtml('Above\n\n---\n\nBelow');
    expect(html).toContain('<hr>');
  });

  it('renders images', async () => {
    const html = await mdxToHtml('![Alt text](https://example.com/img.png)');
    expect(html).toContain('<img');
    expect(html).toContain('src="https://example.com/img.png"');
    expect(html).toContain('alt="Alt text"');
  });
});
