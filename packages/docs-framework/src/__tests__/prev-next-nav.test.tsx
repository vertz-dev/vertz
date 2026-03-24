import { describe, expect, it } from 'bun:test';
import { renderTest } from '@vertz/ui/test';
import { PrevNextNav } from '../layout/prev-next-nav';

describe('PrevNextNav', () => {
  it('renders prev and next links when both exist', () => {
    const { container, unmount } = renderTest(
      PrevNextNav({
        prev: { path: '/intro', title: 'Introduction' },
        next: { path: '/advanced', title: 'Advanced' },
      }),
    );

    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();

    const links = container.querySelectorAll('a');
    expect(links.length).toBe(2);
    expect(links[0]?.textContent).toContain('Introduction');
    expect(links[0]?.getAttribute('href')).toBe('/intro');
    expect(links[1]?.textContent).toContain('Advanced');
    expect(links[1]?.getAttribute('href')).toBe('/advanced');

    unmount();
  });

  it('renders only next link when prev is undefined', () => {
    const { container, unmount } = renderTest(
      PrevNextNav({
        next: { path: '/quickstart', title: 'Quickstart' },
      }),
    );

    const links = container.querySelectorAll('a');
    expect(links.length).toBe(1);
    expect(links[0]?.textContent).toContain('Quickstart');

    unmount();
  });

  it('renders only prev link when next is undefined', () => {
    const { container, unmount } = renderTest(
      PrevNextNav({
        prev: { path: '/', title: 'Home' },
      }),
    );

    const links = container.querySelectorAll('a');
    expect(links.length).toBe(1);
    expect(links[0]?.textContent).toContain('Home');

    unmount();
  });

  it('renders empty nav when neither exists', () => {
    const { container, unmount } = renderTest(PrevNextNav({}));

    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
    const links = container.querySelectorAll('a');
    expect(links.length).toBe(0);

    unmount();
  });
});
