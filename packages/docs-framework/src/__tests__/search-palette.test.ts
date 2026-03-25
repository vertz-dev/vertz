import { describe, expect, it } from 'bun:test';
import type { DocsConfig } from '../config/types';
import { renderPageHtml } from '../dev/render-page-html';
import type { PageRoute } from '../routing/resolve';
import {
  SEARCH_PALETTE_HTML,
  SEARCH_PALETTE_SCRIPT,
  SEARCH_PALETTE_STYLES,
} from '../search/search-palette-script';

describe('Search palette script', () => {
  it('Cmd+K opens the search palette', () => {
    // Script should register keyboard listener for Cmd+K / Ctrl+K
    expect(SEARCH_PALETTE_SCRIPT).toContain('metaKey');
    expect(SEARCH_PALETTE_SCRIPT).toContain('ctrlKey');
    expect(SEARCH_PALETTE_SCRIPT).toContain("key === 'k'");
  });

  it('typing a query calls Pagefind and displays results', () => {
    // Script should reference Pagefind search API
    expect(SEARCH_PALETTE_SCRIPT).toContain('pagefind');
    expect(SEARCH_PALETTE_SCRIPT).toContain('.search(');
  });

  it('clicking a result navigates to that page', () => {
    // Results should be links that navigate
    expect(SEARCH_PALETTE_SCRIPT).toContain('href');
  });

  it('Escape closes the palette', () => {
    expect(SEARCH_PALETTE_SCRIPT).toContain('Escape');
  });

  it('shows empty state when no results found', () => {
    expect(SEARCH_PALETTE_SCRIPT).toContain('No results found');
  });

  it('uses debounce for search input', () => {
    // Should have a setTimeout-based debounce
    expect(SEARCH_PALETTE_SCRIPT).toContain('setTimeout');
    expect(SEARCH_PALETTE_SCRIPT).toContain('clearTimeout');
  });

  it('includes ARIA attributes for accessibility', () => {
    expect(SEARCH_PALETTE_HTML).toContain('role="dialog"');
    expect(SEARCH_PALETTE_HTML).toContain('aria-modal="true"');
    expect(SEARCH_PALETTE_HTML).toContain('role="listbox"');
  });

  it('includes keyboard navigation (arrow keys)', () => {
    expect(SEARCH_PALETTE_SCRIPT).toContain('ArrowDown');
    expect(SEARCH_PALETTE_SCRIPT).toContain('ArrowUp');
  });

  it('includes styles for the search palette', () => {
    expect(SEARCH_PALETTE_STYLES).toContain('[data-search-palette]');
  });

  it('sanitizes Pagefind result data before innerHTML injection', () => {
    // Script must include an escaping function used on result data
    expect(SEARCH_PALETTE_SCRIPT).toContain('function esc(');
    expect(SEARCH_PALETTE_SCRIPT).toContain('esc(item.url');
    expect(SEARCH_PALETTE_SCRIPT).toContain('esc(item.meta');
    expect(SEARCH_PALETTE_SCRIPT).toContain('esc(item.excerpt');
  });
});

describe('Search palette integration', () => {
  const baseConfig: DocsConfig = {
    name: 'Test Docs',
    sidebar: [{ groups: [{ title: 'Guide', pages: ['getting-started'] }] }],
    search: { enabled: true },
  };
  const baseRoute: PageRoute = {
    path: '/getting-started',
    title: 'Getting Started',
    breadcrumbs: [],
  };

  it('injects search palette when search is enabled', () => {
    const html = renderPageHtml({
      config: baseConfig,
      route: baseRoute,
      contentHtml: '<p>Hello</p>',
      headings: [],
      liveReload: false,
    });
    expect(html).toContain('data-search-palette');
    expect(html).toContain('pagefind');
  });

  it('does not inject search palette when search is disabled', () => {
    const html = renderPageHtml({
      config: { ...baseConfig, search: { enabled: false } },
      route: baseRoute,
      contentHtml: '<p>Hello</p>',
      headings: [],
      liveReload: false,
    });
    expect(html).not.toContain('data-search-palette');
  });
});
