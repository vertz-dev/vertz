import { describe, expect, it } from '@vertz/test';
import { RouterContext, signal } from '@vertz/ui';
import type { BreadcrumbClasses } from '../breadcrumb/breadcrumb-composed';
import { ComposedBreadcrumb } from '../breadcrumb/breadcrumb-composed';

// ---------------------------------------------------------------------------
// Router mock — provides minimal RouterContext for Link
// ---------------------------------------------------------------------------

const mockRouter = {
  current: signal(null),
  loaderData: signal([]),
  loaderError: signal(null),
  searchParams: signal({}),
  navigate: async () => {},
  revalidate: async () => {},
  dispose: () => {},
};

// ---------------------------------------------------------------------------
// Test classes
// ---------------------------------------------------------------------------

const classes: BreadcrumbClasses = {
  nav: 'bc-nav',
  list: 'bc-list',
  item: 'bc-item',
  link: 'bc-link',
  page: 'bc-page',
  separator: 'bc-separator',
};

// ---------------------------------------------------------------------------
// Render helpers
// Provider returns children directly — el IS the <nav> element.
// ---------------------------------------------------------------------------

function RenderSingle() {
  return (
    <RouterContext.Provider value={mockRouter}>
      <ComposedBreadcrumb classes={classes}>
        <ComposedBreadcrumb.Item current>Home</ComposedBreadcrumb.Item>
      </ComposedBreadcrumb>
    </RouterContext.Provider>
  );
}

function RenderMultiple() {
  return (
    <RouterContext.Provider value={mockRouter}>
      <ComposedBreadcrumb classes={classes}>
        <ComposedBreadcrumb.Item href="/">Home</ComposedBreadcrumb.Item>
        <ComposedBreadcrumb.Item href="/products">Products</ComposedBreadcrumb.Item>
        <ComposedBreadcrumb.Item current>Current</ComposedBreadcrumb.Item>
      </ComposedBreadcrumb>
    </RouterContext.Provider>
  );
}

function RenderCustomSeparator() {
  return (
    <RouterContext.Provider value={mockRouter}>
      <ComposedBreadcrumb classes={classes} separator="›">
        <ComposedBreadcrumb.Item href="/">Home</ComposedBreadcrumb.Item>
        <ComposedBreadcrumb.Item current>Page</ComposedBreadcrumb.Item>
      </ComposedBreadcrumb>
    </RouterContext.Provider>
  );
}

function RenderWithClassName() {
  return (
    <RouterContext.Provider value={mockRouter}>
      <ComposedBreadcrumb classes={classes} className="custom">
        <ComposedBreadcrumb.Item current>Home</ComposedBreadcrumb.Item>
      </ComposedBreadcrumb>
    </RouterContext.Provider>
  );
}

function RenderUnstyled() {
  return (
    <RouterContext.Provider value={mockRouter}>
      <ComposedBreadcrumb>
        <ComposedBreadcrumb.Item href="/">Home</ComposedBreadcrumb.Item>
        <ComposedBreadcrumb.Item current>Page</ComposedBreadcrumb.Item>
      </ComposedBreadcrumb>
    </RouterContext.Provider>
  );
}

function RenderPlainItem() {
  return (
    <RouterContext.Provider value={mockRouter}>
      <ComposedBreadcrumb classes={classes}>
        <ComposedBreadcrumb.Item>Plain Text</ComposedBreadcrumb.Item>
      </ComposedBreadcrumb>
    </RouterContext.Provider>
  );
}

function RenderTwoItems() {
  return (
    <RouterContext.Provider value={mockRouter}>
      <ComposedBreadcrumb classes={classes}>
        <ComposedBreadcrumb.Item href="/">Home</ComposedBreadcrumb.Item>
        <ComposedBreadcrumb.Item current>Page</ComposedBreadcrumb.Item>
      </ComposedBreadcrumb>
    </RouterContext.Provider>
  );
}

function RenderEmpty() {
  return (
    <RouterContext.Provider value={mockRouter}>
      <ComposedBreadcrumb classes={classes} />
    </RouterContext.Provider>
  );
}

function RenderHrefAndCurrent() {
  return (
    <RouterContext.Provider value={mockRouter}>
      <ComposedBreadcrumb classes={classes}>
        <ComposedBreadcrumb.Item href="/conflict" current>
          Conflict
        </ComposedBreadcrumb.Item>
      </ComposedBreadcrumb>
    </RouterContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComposedBreadcrumb', () => {
  it('renders nav with aria-label="Breadcrumb"', () => {
    const el = RenderSingle();
    // Provider returns children directly — el IS the <nav>
    const nav = el.querySelector('nav') ?? el;
    expect(nav.tagName).toBe('NAV');
    expect(nav.getAttribute('aria-label')).toBe('Breadcrumb');
  });

  it('renders ol inside nav', () => {
    const el = RenderSingle();
    const nav = el.querySelector('nav') ?? el;
    const ol = nav.querySelector('ol');
    expect(ol).not.toBeNull();
  });

  it('applies nav class', () => {
    const el = RenderSingle();
    const nav = el.querySelector('nav') ?? el;
    expect(nav.className).toContain('bc-nav');
  });

  it('applies list class to ol', () => {
    const el = RenderSingle();
    const nav = el.querySelector('nav') ?? el;
    const ol = nav.querySelector('ol');
    expect(ol?.className).toContain('bc-list');
  });

  it('each Item renders as an li', () => {
    const el = RenderTwoItems();
    const nav = el.querySelector('nav') ?? el;
    const items = nav.querySelectorAll('ol li');
    expect(items.length).toBe(2);
  });

  it('Item with href renders an anchor element', () => {
    const el = RenderMultiple();
    const nav = el.querySelector('nav') ?? el;
    const anchors = nav.querySelectorAll('a');
    expect(anchors.length).toBe(2);
    expect(anchors[0]?.getAttribute('href')).toBe('/');
    expect(anchors[0]?.textContent).toBe('Home');
    expect(anchors[1]?.getAttribute('href')).toBe('/products');
    expect(anchors[1]?.textContent).toBe('Products');
  });

  it('applies link class to anchor', () => {
    const el = RenderTwoItems();
    const nav = el.querySelector('nav') ?? el;
    const anchor = nav.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.className).toContain('bc-link');
  });

  it('Item with current renders span with aria-current="page"', () => {
    const el = RenderMultiple();
    const nav = el.querySelector('nav') ?? el;
    const pageSpan = nav.querySelector('[aria-current="page"]');
    expect(pageSpan).not.toBeNull();
    expect(pageSpan?.textContent).toBe('Current');
  });

  it('applies page class to current span', () => {
    const el = RenderSingle();
    const nav = el.querySelector('nav') ?? el;
    const pageSpan = nav.querySelector('[aria-current="page"]');
    expect(pageSpan).not.toBeNull();
    expect(pageSpan?.className).toContain('bc-page');
  });

  it('current Item does not render a link', () => {
    const el = RenderSingle();
    const nav = el.querySelector('nav') ?? el;
    expect(nav.querySelector('a')).toBeNull();
  });

  it('Item with no href and no current renders as plain span', () => {
    const el = RenderPlainItem();
    const nav = el.querySelector('nav') ?? el;
    // No link and no aria-current — should have a span with the text
    expect(nav.querySelector('a')).toBeNull();
    expect(nav.querySelector('[aria-current]')).toBeNull();
    const li = nav.querySelector('li');
    expect(li).not.toBeNull();
    // The li textContent includes separator, so check for presence of our text
    expect(li?.textContent).toContain('Plain Text');
  });

  it('separator elements appear in each item', () => {
    const el = RenderMultiple();
    const nav = el.querySelector('nav') ?? el;
    const separators = nav.querySelectorAll('[role="presentation"]');
    // 3 items → each has a separator span (first hidden via CSS, still in DOM)
    expect(separators.length).toBe(3);
    for (const sep of separators) {
      expect(sep.getAttribute('aria-hidden')).toBe('true');
      expect(sep.textContent).toBe('/');
    }
  });

  it('applies separator class', () => {
    const el = RenderTwoItems();
    const nav = el.querySelector('nav') ?? el;
    const sep = nav.querySelector('[role="presentation"]');
    expect(sep).not.toBeNull();
    expect(sep?.className).toContain('bc-separator');
  });

  it('custom separator text works', () => {
    const el = RenderCustomSeparator();
    const nav = el.querySelector('nav') ?? el;
    const seps = nav.querySelectorAll('[role="presentation"]');
    expect(seps.length).toBeGreaterThan(0);
    for (const sep of seps) {
      expect(sep.textContent).toBe('›');
    }
  });

  it('applies item class to each li', () => {
    const el = RenderTwoItems();
    const nav = el.querySelector('nav') ?? el;
    const items = nav.querySelectorAll('li');
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.className).toContain('bc-item');
    }
  });

  it('appends user className to nav', () => {
    const el = RenderWithClassName();
    const nav = el.querySelector('nav') ?? el;
    expect(nav.className).toContain('bc-nav');
    expect(nav.className).toContain('custom');
  });

  it('renders without crashing when no classes provided', () => {
    const el = RenderUnstyled();
    const nav = el.querySelector('nav') ?? el;
    expect(nav.tagName).toBe('NAV');
    expect(nav.getAttribute('aria-label')).toBe('Breadcrumb');
  });

  it('ol has inline list reset styles', () => {
    const el = RenderSingle();
    const nav = el.querySelector('nav') ?? el;
    const ol = nav.querySelector('ol');
    expect(ol).not.toBeNull();
    expect(ol?.style.listStyle).toBe('none');
    expect(ol?.style.margin).toBe('0');
    expect(ol?.style.padding).toBe('0');
  });

  it('renders empty breadcrumb without crashing', () => {
    const el = RenderEmpty();
    const nav = el.querySelector('nav') ?? el;
    expect(nav.tagName).toBe('NAV');
    const ol = nav.querySelector('ol');
    expect(ol).not.toBeNull();
    expect(ol?.querySelectorAll('li').length).toBe(0);
  });

  it('first separator is in DOM for unstyled usage (theme hides via CSS)', () => {
    const el = RenderUnstyled();
    const nav = el.querySelector('nav') ?? el;
    const separators = nav.querySelectorAll('[role="presentation"]');
    // All items have separators — first one is hidden via theme CSS, not inline
    expect(separators.length).toBe(2);
    for (const sep of separators) {
      expect(sep.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('warns in dev mode when both href and current are set', () => {
    const warns: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => warns.push(String(args[0]));
    try {
      RenderHrefAndCurrent();
      expect(warns.length).toBeGreaterThan(0);
      expect(warns[0]).toContain('both "href" and "current"');
    } finally {
      console.warn = origWarn;
    }
  });

  it('href + current renders as current (no link)', () => {
    const el = RenderHrefAndCurrent();
    const nav = el.querySelector('nav') ?? el;
    const pageSpan = nav.querySelector('[aria-current="page"]');
    expect(pageSpan).not.toBeNull();
    expect(pageSpan?.textContent).toBe('Conflict');
    expect(nav.querySelector('a')).toBeNull();
  });
});
