import { describe, expect, it } from 'bun:test';
import { createBreadcrumbComponent } from '../components/breadcrumb';
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
});

describe('Breadcrumb component', () => {
  const styles = createBreadcrumbStyles();
  const Breadcrumb = createBreadcrumbComponent(styles);

  it('renders nav with aria-label="Breadcrumb"', () => {
    const el = Breadcrumb({ items: [{ label: 'Home' }] });
    expect(el.tagName).toBe('NAV');
    expect(el.getAttribute('aria-label')).toBe('Breadcrumb');
  });

  it('renders ol with li items', () => {
    const el = Breadcrumb({
      items: [
        { label: 'Home', href: '/' },
        { label: 'Products', href: '/products' },
        { label: 'Current' },
      ],
    });
    const ol = el.querySelector('ol');
    expect(ol).not.toBeNull();
    // 3 item li + 2 separator li = 5 total
    const lis = ol?.querySelectorAll('li');
    expect(lis?.length).toBe(5);
  });

  it('last item has aria-current="page" in a span', () => {
    const el = Breadcrumb({
      items: [{ label: 'Home', href: '/' }, { label: 'Current' }],
    });
    const pageSpan = el.querySelector('span[aria-current="page"]');
    expect(pageSpan).not.toBeNull();
    expect(pageSpan?.textContent).toBe('Current');
  });

  it('non-last items with href render as <a>', () => {
    const el = Breadcrumb({
      items: [
        { label: 'Home', href: '/' },
        { label: 'Products', href: '/products' },
        { label: 'Current' },
      ],
    });
    const links = el.querySelectorAll('a');
    expect(links.length).toBe(2);
    expect(links[0]?.getAttribute('href')).toBe('/');
    expect(links[0]?.textContent).toBe('Home');
    expect(links[1]?.getAttribute('href')).toBe('/products');
    expect(links[1]?.textContent).toBe('Products');
  });

  it('separators have role="presentation" and aria-hidden="true"', () => {
    const el = Breadcrumb({
      items: [
        { label: 'Home', href: '/' },
        { label: 'Products', href: '/products' },
        { label: 'Current' },
      ],
    });
    const separators = el.querySelectorAll('li[role="presentation"]');
    expect(separators.length).toBe(2);
    for (const sep of separators) {
      expect(sep.getAttribute('aria-hidden')).toBe('true');
      expect(sep.textContent).toBe('/');
    }
  });

  it('custom separator text works', () => {
    const el = Breadcrumb({
      items: [{ label: 'Home', href: '/' }, { label: 'Current' }],
      separator: '>',
    });
    const sep = el.querySelector('li[role="presentation"]');
    expect(sep?.textContent).toBe('>');
  });

  it('custom class is applied to nav', () => {
    const el = Breadcrumb({
      items: [{ label: 'Home' }],
      class: 'custom-breadcrumb',
    });
    expect(el.className).toContain('custom-breadcrumb');
  });
});
