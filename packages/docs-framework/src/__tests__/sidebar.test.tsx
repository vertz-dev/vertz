import { describe, expect, it } from 'bun:test';
import { renderTest } from '@vertz/ui/test';
import type { SidebarTab } from '../config/types';
import { Sidebar } from '../layout/sidebar';

describe('Sidebar', () => {
  it('renders tabs and groups from config', () => {
    const tabs: SidebarTab[] = [
      {
        tab: 'Guides',
        groups: [
          { title: 'Getting Started', pages: ['index', 'quickstart'] },
          { title: 'Advanced', pages: ['configuration'] },
        ],
      },
    ];

    const { container, unmount } = renderTest(<Sidebar tabs={tabs} activePath="/" />);
    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();

    const groups = container.querySelectorAll('[data-sidebar-group]');
    expect(groups.length).toBe(2);

    const links = container.querySelectorAll('a');
    expect(links.length).toBe(3);

    unmount();
  });

  it('highlights the active page', () => {
    const tabs: SidebarTab[] = [
      {
        tab: 'Guides',
        groups: [{ title: 'Default', pages: ['index', 'quickstart'] }],
      },
    ];

    const { container, unmount } = renderTest(<Sidebar tabs={tabs} activePath="/quickstart" />);

    const activeLink = container.querySelector('[data-active="true"]');
    expect(activeLink).not.toBeNull();
    expect(activeLink?.textContent).toBe('Quickstart');

    unmount();
  });

  it('renders empty nav when no tabs', () => {
    const { container, unmount } = renderTest(<Sidebar tabs={[]} activePath="/" />);
    const links = container.querySelectorAll('a');
    expect(links.length).toBe(0);

    unmount();
  });

  it('handles hyphenated page names', () => {
    const tabs: SidebarTab[] = [
      {
        tab: 'Guides',
        groups: [{ title: 'Default', pages: ['getting-started'] }],
      },
    ];

    const { container, unmount } = renderTest(<Sidebar tabs={tabs} activePath="/" />);
    const link = container.querySelector('a');
    expect(link?.textContent).toBe('Getting Started');

    unmount();
  });

  it('handles nested page paths', () => {
    const tabs: SidebarTab[] = [
      {
        tab: 'Guides',
        groups: [{ title: 'Default', pages: ['guides/advanced'] }],
      },
    ];

    const { container, unmount } = renderTest(<Sidebar tabs={tabs} activePath="/" />);
    const link = container.querySelector('a');
    expect(link?.textContent).toBe('Advanced');
    expect(link?.getAttribute('href')).toBe('/guides/advanced');

    unmount();
  });
});
