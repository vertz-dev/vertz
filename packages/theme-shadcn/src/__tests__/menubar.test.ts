import { describe, expect, it, vi } from 'bun:test';
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
});

describe('themed Menubar', () => {
  it('applies root class to menubar element', async () => {
    const { createThemedMenubar } = await import('../components/primitives/menubar');
    const styles = createMenubarStyles();
    const themedMenubar = createThemedMenubar(styles);
    const mb = themedMenubar();

    expect(mb.root.classList.contains(styles.root)).toBe(true);
  });

  it('applies trigger and content classes to menu', async () => {
    const { createThemedMenubar } = await import('../components/primitives/menubar');
    const styles = createMenubarStyles();
    const themedMenubar = createThemedMenubar(styles);
    const mb = themedMenubar();
    const menu = mb.Menu('file', 'File');

    expect(menu.trigger.classList.contains(styles.trigger)).toBe(true);
    expect(menu.content.classList.contains(styles.content)).toBe(true);
  });

  it('applies item class to items', async () => {
    const { createThemedMenubar } = await import('../components/primitives/menubar');
    const styles = createMenubarStyles();
    const themedMenubar = createThemedMenubar(styles);
    const mb = themedMenubar();
    const menu = mb.Menu('file', 'File');
    const item = menu.Item('new', 'New');

    expect(item.classList.contains(styles.item)).toBe(true);
  });

  it('applies separator class', async () => {
    const { createThemedMenubar } = await import('../components/primitives/menubar');
    const styles = createMenubarStyles();
    const themedMenubar = createThemedMenubar(styles);
    const mb = themedMenubar();
    const menu = mb.Menu('file', 'File');
    const sep = menu.Separator();

    expect(sep.classList.contains(styles.separator)).toBe(true);
  });

  it('preserves primitive behavior — click toggles menu', async () => {
    const { createThemedMenubar } = await import('../components/primitives/menubar');
    const styles = createMenubarStyles();
    const themedMenubar = createThemedMenubar(styles);
    const mb = themedMenubar();
    const menu = mb.Menu('file', 'File');
    menu.Item('new', 'New');

    expect(mb.state.activeMenu.peek()).toBeNull();
    menu.trigger.click();
    expect(mb.state.activeMenu.peek()).toBe('file');
  });

  it('passes options through to primitive', async () => {
    const { createThemedMenubar } = await import('../components/primitives/menubar');
    const styles = createMenubarStyles();
    const onSelect = vi.fn();
    const themedMenubar = createThemedMenubar(styles);
    const mb = themedMenubar({ onSelect });
    const menu = mb.Menu('file', 'File');
    const item = menu.Item('new', 'New');

    menu.trigger.click();
    item.click();
    expect(onSelect).toHaveBeenCalledWith('new');
  });
});
