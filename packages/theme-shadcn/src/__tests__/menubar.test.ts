import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { createMenubarStyles } from '../styles/menubar';

describe('menubar styles', () => {
  const menubar = createMenubarStyles();

  it('has root block', () => {
    expect(typeof menubar.root).toBe('string');
  });

  it('has trigger block', () => {
    expect(typeof menubar.trigger).toBe('string');
  });

  it('has content block', () => {
    expect(typeof menubar.content).toBe('string');
  });

  it('has item block', () => {
    expect(typeof menubar.item).toBe('string');
  });

  it('has separator block', () => {
    expect(typeof menubar.separator).toBe('string');
  });

  it('has label block', () => {
    expect(typeof menubar.label).toBe('string');
  });

  it('class names are non-empty', () => {
    expect(menubar.root.length).toBeGreaterThan(0);
    expect(menubar.trigger.length).toBeGreaterThan(0);
    expect(menubar.content.length).toBeGreaterThan(0);
    expect(menubar.item.length).toBeGreaterThan(0);
  });

  it('CSS contains data-state="open" selector', () => {
    expect(menubar.css).toContain('[data-state="open"]');
  });

  it('root CSS sets explicit foreground color for text contrast', () => {
    const rootClass = menubar.root;
    const rootRules = menubar.css.split('}').filter((rule) => rule.includes(rootClass));
    const rootCSS = rootRules.join('}');
    expect(rootCSS).toMatch(/\bcolor:\s*var\(--color-foreground\)/);
  });
});

describe('themed Menubar (JSX component)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('applies root class to menubar element', async () => {
    const { createThemedMenubar } = await import('../components/primitives/menubar');
    const { ComposedMenubar } = await import('@vertz/ui-primitives');
    const styles = createMenubarStyles();
    const Menubar = createThemedMenubar(styles);

    const root = Menubar({
      children: () => {
        const menu = ComposedMenubar.Menu({
          value: 'file',
          children: () => {
            const t = ComposedMenubar.Trigger({ children: ['File'] });
            const c = ComposedMenubar.Content({
              children: () => [ComposedMenubar.Item({ value: 'new', children: ['New'] })],
            });
            return [t, c];
          },
        });
        return [menu];
      },
    });
    container.appendChild(root);

    expect(root.className).toContain(styles.root);
  });

  it('applies trigger and content classes via composed primitives', async () => {
    const { createThemedMenubar } = await import('../components/primitives/menubar');
    const { ComposedMenubar } = await import('@vertz/ui-primitives');
    const styles = createMenubarStyles();
    const Menubar = createThemedMenubar(styles);

    const root = Menubar({
      children: () => {
        const menu = ComposedMenubar.Menu({
          value: 'file',
          children: () => {
            const t = ComposedMenubar.Trigger({ children: ['File'] });
            const c = ComposedMenubar.Content({
              children: () => [ComposedMenubar.Item({ value: 'new', children: ['New'] })],
            });
            return [t, c];
          },
        });
        return [menu];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('[aria-haspopup="menu"]') as HTMLElement;
    expect(trigger.className).toContain(styles.trigger);

    const content = root.querySelector('[role="menu"]') as HTMLElement;
    expect(content.className).toContain(styles.content);
  });

  it('applies item class to items', async () => {
    const { createThemedMenubar } = await import('../components/primitives/menubar');
    const { ComposedMenubar } = await import('@vertz/ui-primitives');
    const styles = createMenubarStyles();
    const Menubar = createThemedMenubar(styles);

    const root = Menubar({
      children: () => {
        const menu = ComposedMenubar.Menu({
          value: 'file',
          children: () => {
            const t = ComposedMenubar.Trigger({ children: ['File'] });
            const c = ComposedMenubar.Content({
              children: () => [ComposedMenubar.Item({ value: 'new', children: ['New'] })],
            });
            return [t, c];
          },
        });
        return [menu];
      },
    });
    container.appendChild(root);

    const item = root.querySelector('[data-value="new"]') as HTMLElement;
    expect(item.className).toContain(styles.item);
  });

  it('applies separator class', async () => {
    const { createThemedMenubar } = await import('../components/primitives/menubar');
    const { ComposedMenubar } = await import('@vertz/ui-primitives');
    const styles = createMenubarStyles();
    const Menubar = createThemedMenubar(styles);

    const root = Menubar({
      children: () => {
        const menu = ComposedMenubar.Menu({
          value: 'file',
          children: () => {
            const t = ComposedMenubar.Trigger({ children: ['File'] });
            const c = ComposedMenubar.Content({
              children: () => {
                const i1 = ComposedMenubar.Item({ value: 'new', children: ['New'] });
                const sep = ComposedMenubar.Separator({});
                return [i1, sep];
              },
            });
            return [t, c];
          },
        });
        return [menu];
      },
    });
    container.appendChild(root);

    const separator = root.querySelector('[role="separator"]') as HTMLElement;
    expect(separator.className).toContain(styles.separator);
  });

  it('preserves primitive behavior — click toggles menu', async () => {
    const { createThemedMenubar } = await import('../components/primitives/menubar');
    const { ComposedMenubar } = await import('@vertz/ui-primitives');
    const styles = createMenubarStyles();
    const Menubar = createThemedMenubar(styles);

    const root = Menubar({
      children: () => {
        const menu = ComposedMenubar.Menu({
          value: 'file',
          children: () => {
            const t = ComposedMenubar.Trigger({ children: ['File'] });
            const c = ComposedMenubar.Content({
              children: () => [ComposedMenubar.Item({ value: 'new', children: ['New'] })],
            });
            return [t, c];
          },
        });
        return [menu];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('[aria-haspopup="menu"]') as HTMLElement;
    const content = root.querySelector('[role="menu"]') as HTMLElement;

    expect(content.getAttribute('data-state')).toBe('closed');
    trigger.click();
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('passes options through to primitive', async () => {
    const { createThemedMenubar } = await import('../components/primitives/menubar');
    const { ComposedMenubar } = await import('@vertz/ui-primitives');
    const styles = createMenubarStyles();
    const onSelect = vi.fn();
    const Menubar = createThemedMenubar(styles);

    const root = Menubar({
      onSelect,
      children: () => {
        const menu = ComposedMenubar.Menu({
          value: 'file',
          children: () => {
            const t = ComposedMenubar.Trigger({ children: ['File'] });
            const c = ComposedMenubar.Content({
              children: () => [ComposedMenubar.Item({ value: 'new', children: ['New'] })],
            });
            return [t, c];
          },
        });
        return [menu];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('[aria-haspopup="menu"]') as HTMLElement;
    trigger.click();
    const item = root.querySelector('[data-value="new"]') as HTMLElement;
    item.click();
    expect(onSelect).toHaveBeenCalledWith('new');
  });

  it('exposes sub-components from ComposedMenubar', async () => {
    const { createThemedMenubar } = await import('../components/primitives/menubar');
    const styles = createMenubarStyles();
    const Menubar = createThemedMenubar(styles);

    expect(typeof Menubar.Menu).toBe('function');
    expect(typeof Menubar.Trigger).toBe('function');
    expect(typeof Menubar.Content).toBe('function');
    expect(typeof Menubar.Item).toBe('function');
    expect(typeof Menubar.Group).toBe('function');
    expect(typeof Menubar.Label).toBe('function');
    expect(typeof Menubar.Separator).toBe('function');
  });

  it('uses fixed positioning on content when menu is opened (#1612)', async () => {
    const { createThemedMenubar } = await import('../components/primitives/menubar');
    const { ComposedMenubar } = await import('@vertz/ui-primitives');
    const styles = createMenubarStyles();
    const Menubar = createThemedMenubar(styles);

    const root = Menubar({
      children: () => {
        const menu = ComposedMenubar.Menu({
          value: 'file',
          children: () => {
            const t = ComposedMenubar.Trigger({ children: ['File'] });
            const c = ComposedMenubar.Content({
              children: () => [ComposedMenubar.Item({ value: 'new', children: ['New'] })],
            });
            return [t, c];
          },
        });
        return [menu];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('[aria-haspopup="menu"]') as HTMLElement;
    trigger.click();
    // Wait for computePosition promise to resolve
    await new Promise((r) => setTimeout(r, 10));

    const content = root.querySelector('[role="menu"]') as HTMLElement;
    expect(content.getAttribute('data-state')).toBe('open');
    // Floating positioning should set position: fixed on the content
    expect(content.style.position).toBe('fixed');
  });

  it('does not shift sibling menubar items when a menu opens (#1612)', async () => {
    const { createThemedMenubar } = await import('../components/primitives/menubar');
    const { ComposedMenubar } = await import('@vertz/ui-primitives');
    const styles = createMenubarStyles();
    const Menubar = createThemedMenubar(styles);

    const root = Menubar({
      children: () => {
        const file = ComposedMenubar.Menu({
          value: 'file',
          children: () => {
            const t = ComposedMenubar.Trigger({ children: ['File'] });
            const c = ComposedMenubar.Content({
              children: () => [ComposedMenubar.Item({ value: 'new', children: ['New'] })],
            });
            return [t, c];
          },
        });
        const edit = ComposedMenubar.Menu({
          value: 'edit',
          children: () => {
            const t = ComposedMenubar.Trigger({ children: ['Edit'] });
            const c = ComposedMenubar.Content({
              children: () => [ComposedMenubar.Item({ value: 'undo', children: ['Undo'] })],
            });
            return [t, c];
          },
        });
        return [file, edit];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('[data-value="file"]') as HTMLElement;
    trigger.click();
    // Wait for computePosition promise to resolve
    await new Promise((r) => setTimeout(r, 10));

    // Content should use fixed positioning (out of normal flow)
    const content = root.querySelector('[role="menu"]') as HTMLElement;
    expect(content.style.position).toBe('fixed');
  });
});
