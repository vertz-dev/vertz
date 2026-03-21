import { describe, expect, it } from 'bun:test';
import type { BreadcrumbClasses } from '../breadcrumb/breadcrumb-composed';
import { ComposedBreadcrumb } from '../breadcrumb/breadcrumb-composed';

const classes: BreadcrumbClasses = {
  nav: 'bc-nav',
  list: 'bc-list',
  item: 'bc-item',
  link: 'bc-link',
  page: 'bc-page',
  separator: 'bc-separator',
};

function RenderSingle() {
  return <ComposedBreadcrumb items={[{ label: 'Home' }]} classes={classes} />;
}
function RenderMultiple() {
  return (
    <ComposedBreadcrumb
      items={[
        { label: 'Home', href: '/' },
        { label: 'Products', href: '/products' },
        { label: 'Current' },
      ]}
      classes={classes}
    />
  );
}
function RenderCustomSeparator() {
  return (
    <ComposedBreadcrumb
      items={[{ label: 'Home', href: '/' }, { label: 'Current' }]}
      separator=">"
      classes={classes}
    />
  );
}
function RenderWithClass() {
  return <ComposedBreadcrumb items={[{ label: 'Home' }]} classes={classes} className="custom" />;
}
function RenderUnstyled() {
  return <ComposedBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Current' }]} />;
}

describe('ComposedBreadcrumb', () => {
  it('renders nav with aria-label="Breadcrumb"', () => {
    const el = RenderSingle();
    const nav = el.querySelector('nav') ?? el;
    expect(nav.tagName).toBe('NAV');
    expect(nav.getAttribute('aria-label')).toBe('Breadcrumb');
  });

  it('applies nav class', () => {
    const el = RenderSingle();
    const nav = el.querySelector('nav') ?? el;
    expect(nav.className).toContain('bc-nav');
  });

  it('renders ol with li items', () => {
    const el = RenderMultiple();
    const ol = el.querySelector('ol');
    expect(ol).not.toBeNull();
    // 3 items + 2 separators = 5 li elements
    const lis = ol?.querySelectorAll('li');
    expect(lis.length).toBe(5);
  });

  it('last item has aria-current="page" in a span', () => {
    const el = RenderMultiple();
    const pageSpan = el.querySelector('span[aria-current="page"]');
    expect(pageSpan).not.toBeNull();
    expect(pageSpan?.textContent).toBe('Current');
    expect(pageSpan?.className).toContain('bc-page');
  });

  it('non-last items with href render as <a>', () => {
    const el = RenderMultiple();
    const links = el.querySelectorAll('a');
    expect(links.length).toBe(2);
    expect(links[0]?.getAttribute('href')).toBe('/');
    expect(links[0]?.textContent).toBe('Home');
    expect(links[0]?.className).toContain('bc-link');
    expect(links[1]?.getAttribute('href')).toBe('/products');
    expect(links[1]?.textContent).toBe('Products');
  });

  it('separators have role="presentation" and aria-hidden="true"', () => {
    const el = RenderMultiple();
    const separators = el.querySelectorAll('li[role="presentation"]');
    expect(separators.length).toBe(2);
    for (const sep of separators) {
      expect(sep.getAttribute('aria-hidden')).toBe('true');
      expect(sep.textContent).toBe('/');
      expect(sep.className).toContain('bc-separator');
    }
  });

  it('custom separator text works', () => {
    const el = RenderCustomSeparator();
    const sep = el.querySelector('li[role="presentation"]');
    expect(sep?.textContent).toBe('>');
  });

  it('appends user className to nav', () => {
    const el = RenderWithClass();
    const nav = el.querySelector('nav') ?? el;
    expect(nav.className).toContain('bc-nav');
    expect(nav.className).toContain('custom');
  });

  it('renders without crashing when no classes provided', () => {
    const el = RenderUnstyled();
    const nav = el.querySelector('nav') ?? el;
    expect(nav.tagName).toBe('NAV');
    expect(nav.querySelector('a')).not.toBeNull();
  });
});
