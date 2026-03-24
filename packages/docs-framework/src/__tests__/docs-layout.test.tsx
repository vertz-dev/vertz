import { describe, expect, it } from 'bun:test';
import { renderTest } from '@vertz/ui/test';
import type { DocsConfig } from '../config/types';
import { DocsLayout } from '../layout/docs-layout';

const minimalConfig: DocsConfig = {
  name: 'Test Docs',
  sidebar: [
    {
      tab: 'Guides',
      groups: [{ title: 'Getting Started', pages: ['index', 'quickstart'] }],
    },
  ],
};

describe('DocsLayout', () => {
  it('renders header with site name', () => {
    const { container, unmount } = renderTest(
      <DocsLayout config={minimalConfig} activePath="/" content="Hello world" />,
    );

    const header = container.querySelector('header');
    expect(header).not.toBeNull();
    expect(header?.textContent).toContain('Test Docs');

    unmount();
  });

  it('renders sidebar with navigation', () => {
    const { container, unmount } = renderTest(
      <DocsLayout config={minimalConfig} activePath="/" content="Hello world" />,
    );

    const sidebar = container.querySelector('[data-sidebar]');
    expect(sidebar).not.toBeNull();
    const links = sidebar?.querySelectorAll('a');
    expect(links?.length).toBe(2);

    unmount();
  });

  it('renders main content area', () => {
    const { container, unmount } = renderTest(
      <DocsLayout config={minimalConfig} activePath="/" content="Page content here" />,
    );

    const main = container.querySelector('main');
    expect(main).not.toBeNull();

    unmount();
  });

  it('renders footer', () => {
    const config: DocsConfig = {
      ...minimalConfig,
      footer: {
        links: [{ title: 'Resources', items: [{ label: 'API', href: '/api' }] }],
      },
    };

    const { container, unmount } = renderTest(
      <DocsLayout config={config} activePath="/" content="test" />,
    );

    const footer = container.querySelector('footer');
    expect(footer).not.toBeNull();

    unmount();
  });
});
