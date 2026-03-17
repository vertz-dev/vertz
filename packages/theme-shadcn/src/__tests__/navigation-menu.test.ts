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
    const { ComposedNavigationMenu } = await import('@vertz/ui-primitives');
    const styles = createNavigationMenuStyles();
    const NavigationMenu = createThemedNavigationMenu(styles);

    const root = NavigationMenu({
      children: () => {
        const list = ComposedNavigationMenu.List({ children: [] });
        const viewport = ComposedNavigationMenu.Viewport({});
        return [list, viewport];
      },
    });
    container.appendChild(root);

    expect(root.classList.contains(styles.root)).toBe(true);
    const listEl = root.querySelector('[data-part="nav-list"]') as HTMLElement;
    expect(listEl.classList.contains(styles.list)).toBe(true);
    const viewportEl = root.querySelector('[data-part="nav-viewport"]') as HTMLElement;
    expect(viewportEl.classList.contains(styles.viewport)).toBe(true);
  });

  it('applies trigger and content classes to items', async () => {
    const { createThemedNavigationMenu } = await import('../components/primitives/navigation-menu');
    const { ComposedNavigationMenu } = await import('@vertz/ui-primitives');
    const styles = createNavigationMenuStyles();
    const NavigationMenu = createThemedNavigationMenu(styles);

    const root = NavigationMenu({
      children: () => {
        const list = ComposedNavigationMenu.List({
          children: () => {
            const item = ComposedNavigationMenu.Item({
              value: 'products',
              children: () => {
                const trigger = ComposedNavigationMenu.Trigger({ children: ['Products'] });
                const content = ComposedNavigationMenu.Content({ children: ['Products content'] });
                return [trigger, content];
              },
            });
            return [item];
          },
        });
        const viewport = ComposedNavigationMenu.Viewport({});
        return [list, viewport];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('button[data-value="products"]') as HTMLElement;
    expect(trigger.classList.contains(styles.trigger)).toBe(true);
    const contentEl = root.querySelector('[data-part="nav-content"]') as HTMLElement;
    expect(contentEl.classList.contains(styles.content)).toBe(true);
  });

  it('applies link class', async () => {
    const { createThemedNavigationMenu } = await import('../components/primitives/navigation-menu');
    const { ComposedNavigationMenu } = await import('@vertz/ui-primitives');
    const styles = createNavigationMenuStyles();
    const NavigationMenu = createThemedNavigationMenu(styles);

    const root = NavigationMenu({
      children: () => {
        const list = ComposedNavigationMenu.List({
          children: () => {
            const link = ComposedNavigationMenu.Link({ href: '/about', children: ['About'] });
            return [link];
          },
        });
        const viewport = ComposedNavigationMenu.Viewport({});
        return [list, viewport];
      },
    });
    container.appendChild(root);

    const linkEl = root.querySelector('a[href="/about"]') as HTMLElement;
    expect(linkEl.classList.contains(styles.link)).toBe(true);
  });

  it('preserves primitive behavior — click opens content', async () => {
    const { createThemedNavigationMenu } = await import('../components/primitives/navigation-menu');
    const { ComposedNavigationMenu } = await import('@vertz/ui-primitives');
    const styles = createNavigationMenuStyles();
    const NavigationMenu = createThemedNavigationMenu(styles);

    const root = NavigationMenu({
      children: () => {
        const list = ComposedNavigationMenu.List({
          children: () => {
            const item = ComposedNavigationMenu.Item({
              value: 'products',
              children: () => {
                const trigger = ComposedNavigationMenu.Trigger({ children: ['Products'] });
                const content = ComposedNavigationMenu.Content({ children: ['Products content'] });
                return [trigger, content];
              },
            });
            return [item];
          },
        });
        const viewport = ComposedNavigationMenu.Viewport({});
        return [list, viewport];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('button[data-value="products"]') as HTMLElement;
    trigger.click();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('data-state')).toBe('open');
  });

  it('passes options through to primitive', async () => {
    const { createThemedNavigationMenu } = await import('../components/primitives/navigation-menu');
    const { ComposedNavigationMenu } = await import('@vertz/ui-primitives');
    const styles = createNavigationMenuStyles();
    const NavigationMenu = createThemedNavigationMenu(styles);

    const root = NavigationMenu({
      delayOpen: 100,
      children: () => {
        const list = ComposedNavigationMenu.List({
          children: () => {
            const item = ComposedNavigationMenu.Item({
              value: 'products',
              children: () => {
                const trigger = ComposedNavigationMenu.Trigger({ children: ['Products'] });
                const content = ComposedNavigationMenu.Content({ children: ['Products content'] });
                return [trigger, content];
              },
            });
            return [item];
          },
        });
        const viewport = ComposedNavigationMenu.Viewport({});
        return [list, viewport];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('button[data-value="products"]') as HTMLElement;
    const contentEl = root.querySelector('[data-part="nav-content"]') as HTMLElement;

    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(100);

    expect(contentEl.getAttribute('aria-hidden')).toBe('false');
  });

  it('has callable root with sub-component properties', async () => {
    const { createThemedNavigationMenu } = await import('../components/primitives/navigation-menu');
    const styles = createNavigationMenuStyles();
    const NavigationMenu = createThemedNavigationMenu(styles);

    expect(typeof NavigationMenu).toBe('function');
    expect(typeof NavigationMenu.List).toBe('function');
    expect(typeof NavigationMenu.Item).toBe('function');
    expect(typeof NavigationMenu.Trigger).toBe('function');
    expect(typeof NavigationMenu.Content).toBe('function');
    expect(typeof NavigationMenu.Link).toBe('function');
    expect(typeof NavigationMenu.Viewport).toBe('function');
  });
});
