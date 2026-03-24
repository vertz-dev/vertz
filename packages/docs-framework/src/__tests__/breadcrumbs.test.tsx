import { describe, expect, it } from 'bun:test';
import { renderTest } from '@vertz/ui/test';
import type { Breadcrumb } from '../routing/resolve';
import { Breadcrumbs } from '../layout/breadcrumbs';

describe('Breadcrumbs', () => {
  it('renders breadcrumb items with links', () => {
    const crumbs: Breadcrumb[] = [
      { label: 'Home', path: '/' },
      { label: 'Guides', path: '/guides' },
      { label: 'Advanced', path: '/guides/advanced' },
    ];

    const { container, unmount } = renderTest(<Breadcrumbs items={crumbs} />);
    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();

    const links = container.querySelectorAll('a');
    expect(links.length).toBe(3);
    expect(links[0]?.textContent).toBe('Home');
    expect(links[0]?.getAttribute('href')).toBe('/');
    expect(links[2]?.textContent).toBe('Advanced');

    unmount();
  });

  it('renders empty nav when no breadcrumbs', () => {
    const { container, unmount } = renderTest(<Breadcrumbs items={[]} />);
    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
    const links = container.querySelectorAll('a');
    expect(links.length).toBe(0);

    unmount();
  });

  it('adds separator between items', () => {
    const crumbs: Breadcrumb[] = [
      { label: 'Home', path: '/' },
      { label: 'Guides', path: '/guides' },
    ];

    const { container, unmount } = renderTest(<Breadcrumbs items={crumbs} />);
    const separators = container.querySelectorAll('[data-separator]');
    expect(separators.length).toBe(1);

    unmount();
  });
});
