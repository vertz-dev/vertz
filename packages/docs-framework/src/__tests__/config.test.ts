import { describe, expect, it } from 'bun:test';
import { defineDocsConfig } from '../index';

describe('defineDocsConfig', () => {
  it('returns the config object unchanged', () => {
    const config = defineDocsConfig({
      name: 'Test Docs',
    });

    expect(config.name).toBe('Test Docs');
  });

  it('accepts minimal config with just name', () => {
    const config = defineDocsConfig({ name: 'Minimal' });
    expect(config.name).toBe('Minimal');
  });

  it('accepts full config with all options', () => {
    const config = defineDocsConfig({
      name: 'Full Docs',
      logo: {
        light: '/logo/light.svg',
        dark: '/logo/dark.svg',
      },
      favicon: '/favicon.svg',
      theme: {
        palette: 'zinc',
        radius: 'md',
        colors: {
          primary: '#3b82f6',
        },
        appearance: 'system',
        codeTheme: {
          light: 'github-light',
          dark: 'github-dark',
        },
        fonts: {
          heading: 'Geist',
          body: 'Geist',
          mono: 'Geist Mono',
        },
      },
      navbar: {
        links: [{ label: 'GitHub', href: 'https://github.com', icon: 'github' }],
        cta: { label: 'Get Started', href: '/quickstart' },
      },
      footer: {
        socials: { github: 'https://github.com' },
        links: [
          {
            title: 'Resources',
            items: [{ label: 'Blog', href: 'https://blog.example.com' }],
          },
        ],
      },
      sidebar: [
        {
          tab: 'Guides',
          groups: [
            {
              title: 'Getting Started',
              pages: ['index.mdx', 'quickstart.mdx'],
            },
            {
              title: 'Advanced',
              icon: 'settings',
              expanded: true,
              pages: ['guides/advanced.mdx'],
            },
          ],
        },
      ],
      search: {
        placeholder: 'Search...',
      },
      seo: {
        siteName: 'Test',
        ogImage: '/og.png',
        twitterHandle: '@test',
      },
      redirects: [{ source: '/old', destination: '/new' }],
      llm: {
        enabled: true,
        title: 'Test Docs',
        description: 'Test description',
        exclude: ['private/**'],
      },
      banner: {
        text: 'New version!',
        link: { label: 'Read more', href: '/changelog' },
        dismissible: true,
      },
      head: [{ tag: 'script', attrs: { defer: true, src: 'https://example.com/script.js' } }],
      analytics: {
        plausible: { domain: 'example.com' },
      },
    });

    expect(config.name).toBe('Full Docs');
    expect(config.sidebar[0]?.tab).toBe('Guides');
    expect(config.sidebar[0]?.groups[0]?.pages).toEqual(['index.mdx', 'quickstart.mdx']);
    expect(config.redirects?.[0]?.source).toBe('/old');
    expect(config.llm?.enabled).toBe(true);
    expect(config.banner?.text).toBe('New version!');
    expect(config.head?.[0]?.tag).toBe('script');
  });
});
