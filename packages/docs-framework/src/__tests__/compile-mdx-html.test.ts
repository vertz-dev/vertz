import { describe, expect, it } from 'bun:test';
import { compileMdxToHtml } from '../dev/compile-mdx-html';

describe('compileMdxToHtml', () => {
  it('compiles basic markdown to HTML', async () => {
    const html = await compileMdxToHtml('# Hello World\n\nThis is a paragraph.');
    expect(html).toContain('<h1>Hello World</h1>');
    expect(html).toContain('<p>This is a paragraph.</p>');
  });

  it('strips frontmatter before compiling', async () => {
    const source = `---
title: My Page
description: A test page
---

# Content After Frontmatter`;
    const html = await compileMdxToHtml(source);
    expect(html).toContain('<h1>Content After Frontmatter</h1>');
    expect(html).not.toContain('title:');
    expect(html).not.toContain('My Page');
  });

  it('compiles inline code', async () => {
    const html = await compileMdxToHtml('Use `const x = 1` in your code.');
    expect(html).toContain('<code>const x = 1</code>');
  });

  it('compiles code blocks', async () => {
    const source = '```ts\nconst x = 1;\n```';
    const html = await compileMdxToHtml(source);
    expect(html).toContain('<pre>');
    expect(html).toContain('<code');
    expect(html).toContain('const x = 1;');
  });

  it('compiles lists', async () => {
    const source = '- Item 1\n- Item 2\n- Item 3';
    const html = await compileMdxToHtml(source);
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>');
    expect(html).toContain('Item 1');
  });

  it('compiles links', async () => {
    const html = await compileMdxToHtml('[Vertz](https://vertz.dev)');
    expect(html).toContain('<a');
    expect(html).toContain('href="https://vertz.dev"');
    expect(html).toContain('Vertz');
  });

  it('returns empty string for empty input', async () => {
    const html = await compileMdxToHtml('');
    expect(html).toBe('');
  });
});
