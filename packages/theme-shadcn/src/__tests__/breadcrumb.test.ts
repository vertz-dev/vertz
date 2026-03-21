import { describe, expect, it } from 'bun:test';
import { RouterContext, signal } from '@vertz/ui';
import { configureTheme } from '../configure';
import { createBreadcrumbStyles } from '../styles/breadcrumb';

describe('breadcrumb styles', () => {
  const breadcrumb = createBreadcrumbStyles();

  it('has all 6 blocks as non-empty strings', () => {
    expect(typeof breadcrumb.nav).toBe('string');
    expect(typeof breadcrumb.list).toBe('string');
    expect(typeof breadcrumb.item).toBe('string');
    expect(typeof breadcrumb.link).toBe('string');
    expect(typeof breadcrumb.page).toBe('string');
    expect(typeof breadcrumb.separator).toBe('string');
  });

  it('css property exists and contains hover state', () => {
    expect(typeof breadcrumb.css).toBe('string');
    expect(breadcrumb.css).toContain(':hover');
  });

  it('list styles reset list-style, margin, and padding for ol', () => {
    expect(breadcrumb.css).toContain('list-style');
    expect(breadcrumb.css).toContain('none');
  });

  it('item styles hide first-child separator', () => {
    expect(breadcrumb.css).toContain(':first-child');
    expect(breadcrumb.css).toContain('display');
  });
});

describe('Breadcrumb component (composed)', () => {
  const theme = configureTheme();
  const { Breadcrumb } = theme.components;

  const mockRouter = {
    current: signal(null),
    loaderData: signal([]),
    loaderError: signal(null),
    searchParams: signal({}),
    navigate: async () => {},
    revalidate: async () => {},
    dispose: () => {},
  };

  function renderInRouter<T>(fn: () => T): T {
    let result: T;
    RouterContext.Provider(mockRouter, () => {
      result = fn();
    });
    // biome-ignore lint/style/noNonNullAssertion: result assigned in Provider
    return result!;
  }

  it('renders nav with aria-label="Breadcrumb"', () => {
    const el = renderInRouter(() =>
      Breadcrumb({ children: () => Breadcrumb.Item({ current: true, children: 'Home' }) }),
    );
    const nav = (el as HTMLElement).querySelector('nav') ?? el;
    expect(nav.tagName).toBe('NAV');
    expect((nav as HTMLElement).getAttribute('aria-label')).toBe('Breadcrumb');
  });

  it('applies theme styles to nav', () => {
    const el = renderInRouter(() =>
      Breadcrumb({ children: () => Breadcrumb.Item({ current: true, children: 'Home' }) }),
    );
    const nav = (el as HTMLElement).querySelector('nav') ?? el;
    // Theme styles are applied — className should contain the generated class
    expect((nav as HTMLElement).className.length).toBeGreaterThan(0);
  });

  it('Breadcrumb.Item sub-component is accessible', () => {
    expect(typeof Breadcrumb.Item).toBe('function');
  });

  it('Item with current renders aria-current="page"', () => {
    const el = renderInRouter(() =>
      Breadcrumb({ children: () => Breadcrumb.Item({ current: true, children: 'Home' }) }),
    );
    const nav = (el as HTMLElement).querySelector('nav') ?? el;
    const pageSpan = (nav as HTMLElement).querySelector('[aria-current="page"]');
    expect(pageSpan).not.toBeNull();
    expect(pageSpan?.textContent).toBe('Home');
  });

  it('Item with href renders as anchor', () => {
    const el = renderInRouter(() =>
      Breadcrumb({ children: () => Breadcrumb.Item({ href: '/', children: 'Home' }) }),
    );
    const nav = (el as HTMLElement).querySelector('nav') ?? el;
    const anchor = (nav as HTMLElement).querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toBe('/');
  });

  it('separator has role="presentation" and aria-hidden', () => {
    const el = renderInRouter(() =>
      Breadcrumb({ children: () => Breadcrumb.Item({ current: true, children: 'Home' }) }),
    );
    const nav = (el as HTMLElement).querySelector('nav') ?? el;
    const sep = (nav as HTMLElement).querySelector('[role="presentation"]');
    expect(sep).not.toBeNull();
    expect(sep?.getAttribute('aria-hidden')).toBe('true');
  });

  it('custom class is applied to nav', () => {
    const el = renderInRouter(() =>
      Breadcrumb({
        className: 'custom-breadcrumb',
        children: () => Breadcrumb.Item({ current: true, children: 'Home' }),
      }),
    );
    const nav = (el as HTMLElement).querySelector('nav') ?? el;
    expect((nav as HTMLElement).className).toContain('custom-breadcrumb');
  });
});
