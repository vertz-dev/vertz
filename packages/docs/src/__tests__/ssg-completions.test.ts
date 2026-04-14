import { describe, expect, it } from '@vertz/test';
import { Banner } from '../components/banner';
import type { DocsConfig } from '../config/types';
import { renderPageHtml } from '../dev/render-page-html';
import type { PageRoute } from '../routing/resolve';
import { renderAnalyticsScript, renderHeadTags } from '../ssg/head-injection';

const baseConfig: DocsConfig = {
  name: 'Test Docs',
  sidebar: [{ groups: [{ title: 'Guide', pages: ['getting-started'] }] }],
};
const baseRoute: PageRoute = {
  path: '/getting-started',
  title: 'Getting Started',
  breadcrumbs: [],
};

describe('SSG completions', () => {
  describe('hidden pages', () => {
    it('hidden pages include data-pagefind-ignore attribute', () => {
      const html = renderPageHtml({
        config: baseConfig,
        route: baseRoute,
        contentHtml: '<p>Secret page</p>',
        headings: [],
        liveReload: false,
        hidden: true,
      });
      expect(html).toContain('data-pagefind-ignore');
    });

    it('non-hidden pages do not include data-pagefind-ignore', () => {
      const html = renderPageHtml({
        config: baseConfig,
        route: baseRoute,
        contentHtml: '<p>Public page</p>',
        headings: [],
        liveReload: false,
      });
      expect(html).not.toContain('data-pagefind-ignore');
    });
  });

  describe('noindex pages', () => {
    it('noindex pages have robots noindex meta tag', () => {
      const html = renderPageHtml({
        config: baseConfig,
        route: baseRoute,
        contentHtml: '<p>Unlisted page</p>',
        headings: [],
        liveReload: false,
        noindex: true,
      });
      expect(html).toContain('<meta name="robots" content="noindex"');
    });

    it('normal pages do not have noindex meta tag', () => {
      const html = renderPageHtml({
        config: baseConfig,
        route: baseRoute,
        contentHtml: '<p>Normal page</p>',
        headings: [],
        liveReload: false,
      });
      expect(html).not.toContain('noindex');
    });
  });

  describe('head tags', () => {
    it('head tags from config appear in output', () => {
      const tags = renderHeadTags([
        { tag: 'meta', attrs: { name: 'author', content: 'Vertz' } },
        { tag: 'link', attrs: { rel: 'icon', href: '/favicon.ico' } },
      ]);
      expect(tags).toContain('<meta name="author" content="Vertz"');
      expect(tags).toContain('<link rel="icon" href="/favicon.ico"');
    });

    it('head tags with content render correctly', () => {
      const tags = renderHeadTags([{ tag: 'script', content: 'console.log("hi")' }]);
      expect(tags).toContain('<script>console.log("hi")</script>');
    });

    it('head tags appear in rendered page', () => {
      const configWithHead = {
        ...baseConfig,
        head: [{ tag: 'meta', attrs: { name: 'custom', content: 'value' } }],
      };
      const html = renderPageHtml({
        config: configWithHead,
        route: baseRoute,
        contentHtml: '<p>Content</p>',
        headings: [],
        liveReload: false,
      });
      expect(html).toContain('<meta name="custom" content="value"');
    });
  });

  describe('analytics', () => {
    it('plausible analytics script is injected', () => {
      const script = renderAnalyticsScript({ plausible: { domain: 'docs.vertz.dev' } });
      expect(script).toContain('plausible.io');
      expect(script).toContain('docs.vertz.dev');
    });

    it('returns empty string when no analytics configured', () => {
      const script = renderAnalyticsScript({});
      expect(script).toBe('');
    });

    it('analytics appears in rendered page', () => {
      const configWithAnalytics = {
        ...baseConfig,
        analytics: { plausible: { domain: 'docs.vertz.dev' } },
      };
      const html = renderPageHtml({
        config: configWithAnalytics,
        route: baseRoute,
        contentHtml: '<p>Content</p>',
        headings: [],
        liveReload: false,
      });
      expect(html).toContain('plausible.io');
    });

    it('ga4 analytics script is injected with measurement ID', () => {
      const script = renderAnalyticsScript({ ga4: { measurementId: 'G-TEST123' } });
      expect(script).toContain('googletagmanager.com/gtag/js?id=G-TEST123');
      expect(script).toContain('G-TEST123');
    });

    it('posthog analytics script is injected with API key and default host', () => {
      const script = renderAnalyticsScript({ posthog: { apiKey: 'phc_test123' } });
      expect(script).toContain('posthog');
      expect(script).toContain('phc_test123');
      expect(script).toContain('https://us.i.posthog.com');
    });

    it('posthog uses custom apiHost when provided', () => {
      const script = renderAnalyticsScript({
        posthog: { apiKey: 'phc_test', apiHost: 'https://eu.i.posthog.com' },
      });
      expect(script).toContain('https://eu.i.posthog.com');
      expect(script).not.toContain('https://us.i.posthog.com');
    });

    it('all three providers generate scripts simultaneously', () => {
      const script = renderAnalyticsScript({
        plausible: { domain: 'docs.example.com' },
        ga4: { measurementId: 'G-MULTI' },
        posthog: { apiKey: 'phc_multi' },
      });
      expect(script).toContain('plausible.io');
      expect(script).toContain('G-MULTI');
      expect(script).toContain('phc_multi');
    });

    it('ga4 throws on invalid measurementId format', () => {
      expect(() =>
        renderAnalyticsScript({ ga4: { measurementId: "G-TEST'><script>alert(1)</script>" } }),
      ).toThrow(/invalid.*measurementId/i);
    });

    it('posthog throws on invalid apiKey format', () => {
      expect(() => renderAnalyticsScript({ posthog: { apiKey: "bad');alert(1);//" } })).toThrow(
        /invalid.*apiKey/i,
      );
    });

    it('posthog throws on invalid apiHost', () => {
      expect(() =>
        renderAnalyticsScript({
          posthog: { apiKey: 'phc_valid', apiHost: 'javascript:alert(1)' },
        }),
      ).toThrow(/invalid.*apiHost/i);
    });
  });

  describe('Tooltip hover styles', () => {
    it('page includes tooltip hover CSS rule', () => {
      const html = renderPageHtml({
        config: baseConfig,
        route: baseRoute,
        contentHtml: '<p>Content</p>',
        headings: [],
        liveReload: false,
      });
      expect(html).toContain('[data-tooltip]:hover');
      expect(html).toContain('[data-tooltip-text]');
    });
  });

  describe('Banner', () => {
    it('banner renders with text', () => {
      const html = Banner({ text: 'New feature launched!' });
      expect(html).toContain('data-banner');
      expect(html).toContain('New feature launched!');
    });

    it('banner renders with dismiss button when dismissible', () => {
      const html = Banner({ text: 'Announcement', dismissible: true });
      expect(html).toContain('data-banner-dismiss');
    });

    it('dismissible banner checks localStorage on page load', () => {
      const html = Banner({ text: 'Announcement', dismissible: true });
      expect(html).toContain('localStorage.getItem');
      expect(html).toContain('banner-dismissed');
    });

    it('non-dismissible banner does not include localStorage check script', () => {
      const html = Banner({ text: 'Info', dismissible: false });
      expect(html).not.toContain('localStorage.getItem');
    });

    it('banner renders with link', () => {
      const html = Banner({ text: 'Check it out', link: { label: 'Learn more', href: '/blog' } });
      expect(html).toContain('href="/blog"');
      expect(html).toContain('Learn more');
    });

    it('banner appears in rendered page when configured', () => {
      const configWithBanner = {
        ...baseConfig,
        banner: { text: 'Welcome!', dismissible: true },
      };
      const html = renderPageHtml({
        config: configWithBanner,
        route: baseRoute,
        contentHtml: '<p>Content</p>',
        headings: [],
        liveReload: false,
      });
      expect(html).toContain('data-banner');
      expect(html).toContain('Welcome!');
    });
  });
});
