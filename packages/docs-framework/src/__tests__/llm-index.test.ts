import { describe, expect, it } from 'bun:test';
import type { LlmConfig } from '../config/types';
import { generateLlmsTxt } from '../generator/llm-index';
import type { PageRoute } from '../routing/resolve';

function makeRoute(overrides: Partial<PageRoute> & { path: string; title: string }): PageRoute {
  return {
    filePath: 'test.mdx',
    tab: 'Guides',
    group: 'Default',
    breadcrumbs: [],
    prev: undefined,
    next: undefined,
    ...overrides,
  };
}

describe('generateLlmsTxt', () => {
  it('generates an index with title and page list', () => {
    const routes: PageRoute[] = [
      makeRoute({ path: '/', title: 'Home' }),
      makeRoute({ path: '/quickstart', title: 'Quickstart' }),
      makeRoute({ path: '/guides/advanced', title: 'Advanced' }),
    ];
    const config: LlmConfig = {
      title: 'Vertz Docs',
      description: 'Documentation for Vertz framework',
    };
    const baseUrl = 'https://docs.vertz.dev';

    const output = generateLlmsTxt(routes, config, baseUrl);
    expect(output).toContain('# Vertz Docs');
    expect(output).toContain('Documentation for Vertz framework');
    expect(output).toContain('https://docs.vertz.dev/llms/home.md');
    expect(output).toContain('https://docs.vertz.dev/llms/quickstart.md');
    expect(output).toContain('https://docs.vertz.dev/llms/guides/advanced.md');
  });

  it('uses route titles as link labels', () => {
    const routes: PageRoute[] = [makeRoute({ path: '/quickstart', title: 'Quickstart Guide' })];
    const config: LlmConfig = { title: 'Docs' };
    const output = generateLlmsTxt(routes, config, 'https://docs.example.com');
    expect(output).toContain('- [Quickstart Guide]');
  });

  it('generates llms-full.txt with all content concatenated', () => {
    const pages = [
      { path: '/intro', title: 'Intro', markdown: '# Intro\n\nWelcome.\n' },
      { path: '/guide', title: 'Guide', markdown: '# Guide\n\nDo things.\n' },
    ];
    const config: LlmConfig = { title: 'My Docs', description: 'All docs' };

    const { generateLlmsFullTxt } = require('../generator/llm-index');
    const output = generateLlmsFullTxt(pages, config);
    expect(output).toContain('# My Docs');
    expect(output).toContain('# Intro');
    expect(output).toContain('Welcome.');
    expect(output).toContain('# Guide');
    expect(output).toContain('Do things.');
  });

  it('returns empty string when no routes provided', () => {
    const config: LlmConfig = { title: 'Empty' };
    const output = generateLlmsTxt([], config, 'https://example.com');
    expect(output).toContain('# Empty');
    expect(output).not.toContain('- [');
  });
});
