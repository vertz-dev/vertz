import { describe, expect, it, vi } from 'bun:test';
import { createContextMenuStyles } from '../styles/context-menu';

// ── Styles ─────────────────────────────────────────────────

describe('context-menu styles', () => {
  const cm = createContextMenuStyles();

  it('has content, item, group, label, and separator blocks', () => {
    expect(typeof cm.content).toBe('string');
    expect(typeof cm.item).toBe('string');
    expect(typeof cm.group).toBe('string');
    expect(typeof cm.label).toBe('string');
    expect(typeof cm.separator).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(cm.content.length).toBeGreaterThan(0);
    expect(cm.item.length).toBeGreaterThan(0);
    expect(cm.group.length).toBeGreaterThan(0);
    expect(cm.label.length).toBeGreaterThan(0);
    expect(cm.separator.length).toBeGreaterThan(0);
  });

  it('CSS contains enter/exit animations for content', () => {
    expect(cm.css).toContain('vz-zoom-in');
    expect(cm.css).toContain('vz-zoom-out');
  });
});

// ── Themed Component ──────────────────────────────────────

describe('createThemedContextMenu', () => {
  it('applies theme classes to context menu content', async () => {
    const { createThemedContextMenu } = await import('../components/primitives/context-menu');
    const styles = createContextMenuStyles();
    const themedMenu = createThemedContextMenu(styles);
    const menu = themedMenu();

    expect(menu.content.classList.contains(styles.content)).toBe(true);
  });

  it('Item factory applies theme classes', async () => {
    const { createThemedContextMenu } = await import('../components/primitives/context-menu');
    const styles = createContextMenuStyles();
    const themedMenu = createThemedContextMenu(styles);
    const menu = themedMenu();
    const item = menu.Item('edit', 'Edit');

    expect(item.classList.contains(styles.item)).toBe(true);
  });

  it('Group applies group and label theme classes', async () => {
    const { createThemedContextMenu } = await import('../components/primitives/context-menu');
    const styles = createContextMenuStyles();
    const themedMenu = createThemedContextMenu(styles);
    const menu = themedMenu();

    const group = menu.Group('Actions');
    expect(group.el.classList.contains(styles.group)).toBe(true);
    const labelEl = group.el.firstElementChild as HTMLElement;
    expect(labelEl.textContent).toBe('Actions');
    expect(labelEl.classList.contains(styles.label)).toBe(true);
  });

  it('Group uses aria-labelledby instead of aria-label to avoid double announcement', async () => {
    const { createThemedContextMenu } = await import('../components/primitives/context-menu');
    const styles = createContextMenuStyles();
    const themedMenu = createThemedContextMenu(styles);
    const menu = themedMenu();

    const group = menu.Group('Actions');
    const labelEl = group.el.firstElementChild as HTMLElement;
    expect(group.el.getAttribute('aria-label')).toBeNull();
    expect(group.el.getAttribute('aria-labelledby')).toBe(labelEl.id);
    expect(labelEl.id).toBeTruthy();
  });

  it('Group Item applies item theme class', async () => {
    const { createThemedContextMenu } = await import('../components/primitives/context-menu');
    const styles = createContextMenuStyles();
    const themedMenu = createThemedContextMenu(styles);
    const menu = themedMenu();

    const group = menu.Group('Actions');
    const item = group.Item('copy', 'Copy');
    expect(item.classList.contains(styles.item)).toBe(true);
  });

  it('Separator applies separator theme class', async () => {
    const { createThemedContextMenu } = await import('../components/primitives/context-menu');
    const styles = createContextMenuStyles();
    const themedMenu = createThemedContextMenu(styles);
    const menu = themedMenu();

    const sep = menu.Separator();
    expect(sep.classList.contains(styles.separator)).toBe(true);
  });

  it('Label applies label theme class', async () => {
    const { createThemedContextMenu } = await import('../components/primitives/context-menu');
    const styles = createContextMenuStyles();
    const themedMenu = createThemedContextMenu(styles);
    const menu = themedMenu();

    const label = menu.Label('My Account');
    expect(label.classList.contains(styles.label)).toBe(true);
    expect(label.textContent).toBe('My Account');
  });

  it('preserves primitive behavior — contextmenu event opens menu', async () => {
    const { createThemedContextMenu } = await import('../components/primitives/context-menu');
    const styles = createContextMenuStyles();
    const themedMenu = createThemedContextMenu(styles);
    const menu = themedMenu();
    menu.Item('a', 'A');

    expect(menu.state.open.peek()).toBe(false);
    menu.trigger.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 100, clientY: 200, bubbles: true }),
    );
    expect(menu.state.open.peek()).toBe(true);
  });

  it('preserves primitive behavior — onSelect callback', async () => {
    const { createThemedContextMenu } = await import('../components/primitives/context-menu');
    const styles = createContextMenuStyles();
    const onSelect = vi.fn();
    const themedMenu = createThemedContextMenu(styles);
    const menu = themedMenu({ onSelect });

    menu.trigger.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 100, clientY: 200, bubbles: true }),
    );
    const item = menu.Item('edit', 'Edit');
    item.click();

    expect(onSelect).toHaveBeenCalledWith('edit');
  });

  it('returns trigger as HTMLDivElement and content as HTMLDivElement', async () => {
    const { createThemedContextMenu } = await import('../components/primitives/context-menu');
    const styles = createContextMenuStyles();
    const themedMenu = createThemedContextMenu(styles);
    const menu = themedMenu();

    expect(menu.trigger).toBeInstanceOf(HTMLDivElement);
    expect(menu.content).toBeInstanceOf(HTMLDivElement);
    expect(menu.state).toBeDefined();
    expect(typeof menu.Item).toBe('function');
    expect(typeof menu.Group).toBe('function');
    expect(typeof menu.Separator).toBe('function');
    expect(typeof menu.Label).toBe('function');
  });
});
