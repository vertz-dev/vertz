import { describe, expect, it } from 'bun:test';
import { mdxToMarkdown } from '../mdx/llm-markdown';

describe('LLM enhancements', () => {
  describe('internal link rewriting', () => {
    it('internal links point to llm/*.md files', () => {
      const md = mdxToMarkdown('Check the [Getting Started](/quickstart) guide.');
      expect(md).toContain('[Getting Started](llm/quickstart.md)');
    });

    it('preserves external links unchanged', () => {
      const md = mdxToMarkdown('Visit [GitHub](https://github.com) for more.');
      expect(md).toContain('[GitHub](https://github.com)');
    });

    it('does not rewrite links inside code blocks', () => {
      const md = mdxToMarkdown('```\n[link](/path)\n```');
      expect(md).toContain('[link](/path)');
      expect(md).not.toContain('llm/path.md');
    });

    it('handles links with anchors', () => {
      const md = mdxToMarkdown('See [Config](/api/config#options) for details.');
      expect(md).toContain('[Config](llm/api/config.md#options)');
    });
  });

  describe('code block metadata', () => {
    it('code blocks have language metadata comments', () => {
      const md = mdxToMarkdown('```ts\nconst x = 1;\n```');
      expect(md).toContain('<!-- language: ts -->');
      expect(md).toContain('const x = 1;');
    });

    it('code blocks without language have no metadata comment', () => {
      const md = mdxToMarkdown('```\nplain text\n```');
      expect(md).not.toContain('<!-- language:');
    });
  });
});
