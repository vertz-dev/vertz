import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { createNavigationMenuStyles } from '../styles/navigation-menu';

// ── Styles ─────────────────────────────────────────────────

describe('navigation-menu styles', () => {
  const nav = createNavigationMenuStyles();

  it('has root, list, trigger, content, link, and viewport blocks', () => {
    expect(typeof nav.root).toBe('string');
    expect(typeof nav.list).toBe('string');
    expect(typeof nav.trigger).toBe('string');
    expect(typeof nav.content).toBe('string');
    expect(typeof nav.link).toBe('string');
    expect(typeof nav.viewport).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(nav.root.length).toBeGreaterThan(0);
    expect(nav.list.length).toBeGreaterThan(0);
    expect(nav.trigger.length).toBeGreaterThan(0);
    expect(nav.content.length).toBeGreaterThan(0);
    expect(nav.link.length).toBeGreaterThan(0);
    expect(nav.viewport.length).toBeGreaterThan(0);
  });

  it('CSS contains open/close animation selectors', () => {
    expect(nav.css).toContain('data-state="open"');
    expect(nav.css).toContain('data-state="closed"');
  });
});

// ── Themed Component ──────────────────────────────────────

describe('createThemedNavigationMenu', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.removeChild(container);
  });

  it('applies root, list, and viewport classes', async () => {
    const { createThemedNavigationMenu } = await import('../components/primitives/navigation-menu');
    const styles = createNavigationMenuStyles();
    const themedNav = createThemedNavigationMenu(styles);
    const nav = themedNav();

    expect(nav.root.classList.contains(styles.root)).toBe(true);
    expect(nav.list.classList.contains(styles.list)).toBe(true);
    expect(nav.viewport.classList.contains(styles.viewport)).toBe(true);
  });

  it('Item factory applies trigger and content classes', async () => {
    const { createThemedNavigationMenu } = await import('../components/primitives/navigation-menu');
    const styles = createNavigationMenuStyles();
    const themedNav = createThemedNavigationMenu(styles);
    const nav = themedNav();
    container.appendChild(nav.root);
    const { trigger, content } = nav.Item('products', 'Products');

    expect(trigger.classList.contains(styles.trigger)).toBe(true);
    expect(content.classList.contains(styles.content)).toBe(true);
  });

  it('Link factory applies link class', async () => {
    const { createThemedNavigationMenu } = await import('../components/primitives/navigation-menu');
    const styles = createNavigationMenuStyles();
    const themedNav = createThemedNavigationMenu(styles);
    const nav = themedNav();
    container.appendChild(nav.root);
    const link = nav.Link('/about', 'About');

    expect(link.classList.contains(styles.link)).toBe(true);
  });

  it('preserves primitive behavior — click opens content', async () => {
    const { createThemedNavigationMenu } = await import('../components/primitives/navigation-menu');
    const styles = createNavigationMenuStyles();
    const themedNav = createThemedNavigationMenu(styles);
    const nav = themedNav();
    container.appendChild(nav.root);
    const { trigger } = nav.Item('products', 'Products');

    expect(nav.state.activeItem.peek()).toBeNull();
    trigger.click();
    expect(nav.state.activeItem.peek()).toBe('products');
  });

  it('passes options through to primitive', async () => {
    const { createThemedNavigationMenu } = await import('../components/primitives/navigation-menu');
    const styles = createNavigationMenuStyles();
    const themedNav = createThemedNavigationMenu(styles);
    const nav = themedNav({ delayOpen: 100 });
    container.appendChild(nav.root);
    const { trigger, content } = nav.Item('products', 'Products');

    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(100);

    expect(content.getAttribute('aria-hidden')).toBe('false');
  });

  it('returns root, list, viewport, state, Item, and Link', async () => {
    const { createThemedNavigationMenu } = await import('../components/primitives/navigation-menu');
    const styles = createNavigationMenuStyles();
    const themedNav = createThemedNavigationMenu(styles);
    const nav = themedNav();

    expect(nav.root).toBeInstanceOf(HTMLElement);
    expect(nav.list).toBeInstanceOf(HTMLDivElement);
    expect(nav.viewport).toBeInstanceOf(HTMLDivElement);
    expect(nav.state.activeItem).toBeDefined();
    expect(typeof nav.Item).toBe('function');
    expect(typeof nav.Link).toBe('function');
  });
});
