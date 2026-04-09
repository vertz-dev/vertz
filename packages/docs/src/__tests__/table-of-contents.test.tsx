import { describe, expect, it } from '@vertz/test';
import { renderTest } from '@vertz/ui/test';
import { TableOfContents } from '../layout/table-of-contents';
import type { TocHeading } from '../mdx/extract-headings';

describe('TableOfContents', () => {
  it('renders heading links', () => {
    const headings: TocHeading[] = [
      { depth: 2, text: 'Installation', slug: 'installation' },
      { depth: 2, text: 'Usage', slug: 'usage' },
      { depth: 3, text: 'Basic Usage', slug: 'basic-usage' },
    ];

    const { container, unmount } = renderTest(TableOfContents({ headings }));
    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();

    const links = container.querySelectorAll('a');
    expect(links.length).toBe(3);
    expect(links[0]?.textContent).toBe('Installation');
    expect(links[0]?.getAttribute('href')).toBe('#installation');

    unmount();
  });

  it('renders empty nav when no headings', () => {
    const { container, unmount } = renderTest(TableOfContents({ headings: [] }));
    const links = container.querySelectorAll('a');
    expect(links.length).toBe(0);

    unmount();
  });

  it('indents h3 headings deeper than h2', () => {
    const headings: TocHeading[] = [
      { depth: 2, text: 'Top', slug: 'top' },
      { depth: 3, text: 'Nested', slug: 'nested' },
    ];

    const { container, unmount } = renderTest(TableOfContents({ headings }));
    const items = container.querySelectorAll('[data-toc-item]');
    expect(items.length).toBe(2);
    // h3 should have indent
    const nestedItem = items[1];
    expect(nestedItem?.getAttribute('data-depth')).toBe('3');

    unmount();
  });
});
