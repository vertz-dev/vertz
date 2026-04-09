import { describe, expect, it } from '@vertz/test';
import { extractHeadings } from '../mdx/extract-headings';

describe('extractHeadings', () => {
  it('extracts h2 and h3 headings from markdown content', () => {
    const md = `# Title
## Getting Started
Some content here.
### Installation
Install the package.
### Configuration
Configure it.
## API Reference
More content.
### Methods
Method docs.
`;
    const headings = extractHeadings(md);
    expect(headings).toEqual([
      { depth: 2, text: 'Getting Started', slug: 'getting-started' },
      { depth: 3, text: 'Installation', slug: 'installation' },
      { depth: 3, text: 'Configuration', slug: 'configuration' },
      { depth: 2, text: 'API Reference', slug: 'api-reference' },
      { depth: 3, text: 'Methods', slug: 'methods' },
    ]);
  });

  it('skips h1 headings (page title)', () => {
    const md = `# Page Title
## Section
`;
    const headings = extractHeadings(md);
    expect(headings).toHaveLength(1);
    expect(headings[0]?.depth).toBe(2);
  });

  it('generates slugs from heading text', () => {
    const md = `## Hello World
## Some Complex Heading!
## kebab-case-already
`;
    const headings = extractHeadings(md);
    expect(headings[0]?.slug).toBe('hello-world');
    expect(headings[1]?.slug).toBe('some-complex-heading');
    expect(headings[2]?.slug).toBe('kebab-case-already');
  });

  it('returns empty array for content with no headings', () => {
    const md = 'Just some text without any headings.';
    const headings = extractHeadings(md);
    expect(headings).toEqual([]);
  });

  it('handles inline code in headings', () => {
    const md = '## Using `defineConfig()`\n';
    const headings = extractHeadings(md);
    expect(headings[0]?.text).toBe('Using defineConfig()');
    expect(headings[0]?.slug).toBe('using-defineconfig');
  });
});
