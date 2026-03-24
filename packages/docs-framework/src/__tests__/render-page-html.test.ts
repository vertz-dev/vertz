import { describe, expect, it } from 'bun:test';
import type { DocsConfig } from '../config/types';
import { renderPageHtml } from '../dev/render-page-html';
import type { PageRoute } from '../routing/resolve';

const config: DocsConfig = {
  name: 'Test Docs',
  sidebar: [
    {
      tab: 'Guides',
      groups: [{ title: 'Getting Started', pages: ['index.mdx', 'quickstart.mdx'] }],
    },
  ],
};

const route: PageRoute = {
  path: '/quickstart',
  filePath: 'quickstart.mdx',
  title: 'Quickstart',
  tab: 'Guides',
  group: 'Getting Started',
  breadcrumbs: [{ label: 'Quickstart', path: '/quickstart' }],
  prev: { path: '/', title: 'Index' },
  next: undefined,
};

describe('renderPageHtml', () => {
  it('returns a complete HTML document', () => {
    const html = renderPageHtml({ config, route, contentHtml: '<p>Hello</p>', headings: [] });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('includes the page title in <title> and <h1>', () => {
    const html = renderPageHtml({ config, route, contentHtml: '<p>Hello</p>', headings: [] });
    expect(html).toContain('<title>Quickstart - Test Docs</title>');
  });

  it('renders sidebar with page links', () => {
    const html = renderPageHtml({ config, route, contentHtml: '', headings: [] });
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/quickstart"');
    expect(html).toContain('Index');
    expect(html).toContain('Quickstart');
  });

  it('marks active sidebar link', () => {
    const html = renderPageHtml({ config, route, contentHtml: '', headings: [] });
    expect(html).toContain('data-active="true"');
  });

  it('includes content HTML in main area', () => {
    const html = renderPageHtml({
      config,
      route,
      contentHtml: '<h2>Getting Started</h2><p>Follow these steps.</p>',
      headings: [],
    });
    expect(html).toContain('<h2>Getting Started</h2>');
    expect(html).toContain('Follow these steps.');
  });

  it('renders breadcrumbs', () => {
    const html = renderPageHtml({ config, route, contentHtml: '', headings: [] });
    expect(html).toContain('Quickstart');
    expect(html).toContain('data-breadcrumbs');
  });

  it('renders table of contents from headings', () => {
    const headings = [
      { text: 'Installation', depth: 2, slug: 'installation' },
      { text: 'Configuration', depth: 2, slug: 'configuration' },
      { text: 'Advanced', depth: 3, slug: 'advanced' },
    ];
    const html = renderPageHtml({ config, route, contentHtml: '', headings });
    expect(html).toContain('Installation');
    expect(html).toContain('Configuration');
    expect(html).toContain('Advanced');
    expect(html).toContain('data-toc');
  });

  it('renders prev/next navigation', () => {
    const html = renderPageHtml({ config, route, contentHtml: '', headings: [] });
    expect(html).toContain('Index');
    expect(html).toContain('href="/"');
    expect(html).toContain('data-prev-next');
  });

  it('renders header with site name', () => {
    const html = renderPageHtml({ config, route, contentHtml: '', headings: [] });
    expect(html).toContain('Test Docs');
    expect(html).toContain('<header');
  });

  it('includes live reload script', () => {
    const html = renderPageHtml({ config, route, contentHtml: '', headings: [] });
    expect(html).toContain('EventSource');
  });

  it('includes search button when search is enabled', () => {
    const searchConfig: DocsConfig = { ...config, search: { enabled: true } };
    const html = renderPageHtml({ config: searchConfig, route, contentHtml: '', headings: [] });
    expect(html).toContain('data-search');
  });

  it('omits search when search is not configured', () => {
    const html = renderPageHtml({ config, route, contentHtml: '', headings: [] });
    expect(html).not.toContain('data-search');
  });

  it('renders navbar links', () => {
    const navConfig: DocsConfig = {
      ...config,
      navbar: {
        links: [
          { label: 'GitHub', href: 'https://github.com/vertz-dev' },
        ],
      },
    };
    const html = renderPageHtml({ config: navConfig, route, contentHtml: '', headings: [] });
    expect(html).toContain('GitHub');
    expect(html).toContain('https://github.com/vertz-dev');
  });

  it('renders navbar CTA button', () => {
    const ctaConfig: DocsConfig = {
      ...config,
      navbar: {
        cta: { label: 'Get Started', href: '/quickstart' },
      },
    };
    const html = renderPageHtml({ config: ctaConfig, route, contentHtml: '', headings: [] });
    expect(html).toContain('Get Started');
  });
});
