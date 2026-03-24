import { describe, expect, it } from 'bun:test';
import { renderTest } from '@vertz/ui/test';
import { Header } from '../layout/header';

describe('Header', () => {
  it('renders site name', () => {
    const { container, unmount } = renderTest(<Header name="Vertz Docs" />);

    const header = container.querySelector('header');
    expect(header).not.toBeNull();
    expect(header?.textContent).toContain('Vertz Docs');

    unmount();
  });

  it('renders navbar links', () => {
    const { container, unmount } = renderTest(
      <Header
        name="Docs"
        navbar={{
          links: [
            { label: 'GitHub', href: 'https://github.com' },
            { label: 'Blog', href: '/blog' },
          ],
        }}
      />,
    );

    const links = container.querySelectorAll('a');
    expect(links.length).toBeGreaterThanOrEqual(2);

    unmount();
  });

  it('renders CTA button when provided', () => {
    const { container, unmount } = renderTest(
      <Header
        name="Docs"
        navbar={{
          cta: { label: 'Get Started', href: '/quickstart' },
        }}
      />,
    );

    const cta = container.querySelector('[data-cta]');
    expect(cta).not.toBeNull();
    expect(cta?.textContent).toContain('Get Started');

    unmount();
  });
});
