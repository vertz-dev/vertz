import { describe, expect, it } from '@vertz/test';
import { renderTest } from '@vertz/ui/test';
import { Footer } from '../layout/footer';

describe('Footer', () => {
  it('renders footer element', () => {
    const { container, unmount } = renderTest(Footer({}));
    const footer = container.querySelector('footer');
    expect(footer).not.toBeNull();
    unmount();
  });

  it('renders link groups', () => {
    const { container, unmount } = renderTest(
      Footer({
        links: [
          {
            title: 'Resources',
            items: [
              { label: 'Docs', href: '/docs' },
              { label: 'API', href: '/api' },
            ],
          },
          {
            title: 'Community',
            items: [{ label: 'Discord', href: 'https://discord.gg' }],
          },
        ],
      }),
    );

    const groups = container.querySelectorAll('[data-footer-group]');
    expect(groups.length).toBe(2);

    const links = container.querySelectorAll('a');
    expect(links.length).toBe(3);

    unmount();
  });

  it('renders social links', () => {
    const { container, unmount } = renderTest(
      Footer({
        socials: {
          github: 'https://github.com/vertz',
          twitter: 'https://twitter.com/vertz',
        },
      }),
    );

    const socialLinks = container.querySelectorAll('[data-social]');
    expect(socialLinks.length).toBe(2);

    unmount();
  });
});
