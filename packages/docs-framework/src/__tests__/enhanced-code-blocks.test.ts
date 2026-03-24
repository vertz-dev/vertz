import { describe, expect, it } from 'bun:test';
import { compileMdxToHtml } from '../dev/compile-mdx-html';
import { parseMeta } from '../mdx/rehype-enhanced-code';

describe('parseMeta', () => {
  it('returns defaults for empty string', () => {
    const result = parseMeta('');
    expect(result).toEqual({ title: undefined, highlightLines: [], showLineNumbers: false });
  });

  it('extracts title from title="file.ts"', () => {
    const result = parseMeta('title="schema.ts"');
    expect(result.title).toBe('schema.ts');
  });

  it('extracts single line number from {3}', () => {
    const result = parseMeta('{3}');
    expect(result.highlightLines).toEqual([3]);
  });

  it('extracts range from {3-5}', () => {
    const result = parseMeta('{3-5}');
    expect(result.highlightLines).toEqual([3, 4, 5]);
  });

  it('extracts comma-separated ranges from {1,3-5,8}', () => {
    const result = parseMeta('{1,3-5,8}');
    expect(result.highlightLines).toEqual([1, 3, 4, 5, 8]);
  });

  it('detects showLineNumbers flag', () => {
    const result = parseMeta('showLineNumbers');
    expect(result.showLineNumbers).toBe(true);
  });

  it('parses combined meta string', () => {
    const result = parseMeta('title="app.ts" {2-4} showLineNumbers');
    expect(result.title).toBe('app.ts');
    expect(result.highlightLines).toEqual([2, 3, 4]);
    expect(result.showLineNumbers).toBe(true);
  });
});

describe('Enhanced code blocks', () => {
  it('renders syntax-highlighted code via Shiki', async () => {
    const source = `
\`\`\`ts
const x: number = 1;
\`\`\`
`;
    const html = await compileMdxToHtml(source);
    // Shiki wraps code in <pre> with shiki class and applies theme styles
    expect(html).toContain('<pre');
    expect(html).toContain('<code');
    // Shiki tokenizes and wraps in <span> elements with style attributes
    expect(html).toContain('<span');
  });

  it('displays filename from title="file.ts"', async () => {
    const source = `
\`\`\`ts title="schema.ts"
const x = 1;
\`\`\`
`;
    const html = await compileMdxToHtml(source);
    expect(html).toContain('data-code-title');
    expect(html).toContain('schema.ts');
  });

  it('renders line numbers when showLineNumbers is set', async () => {
    const source = `
\`\`\`ts showLineNumbers
const a = 1;
const b = 2;
const c = 3;
\`\`\`
`;
    const html = await compileMdxToHtml(source);
    expect(html).toContain('data-line-number');
  });

  it('highlights lines specified by {3-5} range', async () => {
    const source = `
\`\`\`ts {2}
const a = 1;
const b = 2;
const c = 3;
\`\`\`
`;
    const html = await compileMdxToHtml(source);
    expect(html).toContain('data-highlighted');
  });

  it('highlights comma-separated ranges like {1,3}', async () => {
    const source = `
\`\`\`ts {1,3}
const a = 1;
const b = 2;
const c = 3;
\`\`\`
`;
    const html = await compileMdxToHtml(source);
    // Should have exactly 2 highlighted lines (1 and 3)
    const matches = html.match(/data-highlighted/g);
    expect(matches).toHaveLength(2);
  });

  it('renders a copy button', async () => {
    const source = `
\`\`\`ts
const x = 1;
\`\`\`
`;
    const html = await compileMdxToHtml(source);
    expect(html).toContain('data-copy');
  });

  it('styles diff lines with add/remove attributes', async () => {
    const source = `
\`\`\`diff
- const old = true;
+ const new = false;
\`\`\`
`;
    const html = await compileMdxToHtml(source);
    expect(html).toContain('data-diff-add');
    expect(html).toContain('data-diff-remove');
  });
});
