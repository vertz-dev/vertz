import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
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
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('returns a callable with sub-component properties', async () => {
    const { createThemedContextMenu } = await import('../components/primitives/context-menu');
    const styles = createContextMenuStyles();
    const ContextMenu = createThemedContextMenu(styles);

    expect(typeof ContextMenu).toBe('function');
    expect(typeof ContextMenu.Trigger).toBe('function');
    expect(typeof ContextMenu.Content).toBe('function');
    expect(typeof ContextMenu.Item).toBe('function');
    expect(typeof ContextMenu.Group).toBe('function');
    expect(typeof ContextMenu.Label).toBe('function');
    expect(typeof ContextMenu.Separator).toBe('function');
  });

  it('applies theme classes to content', async () => {
    const { createThemedContextMenu } = await import('../components/primitives/context-menu');
    const styles = createContextMenuStyles();
    const ContextMenu = createThemedContextMenu(styles);

    const root = ContextMenu({
      children: () => {
        const t = ContextMenu.Trigger({
          children: [document.createTextNode('Right-click')],
        });
        const c = ContextMenu.Content({
          children: () => [ContextMenu.Item({ value: 'edit', children: ['Edit'] })],
        });
        return [t, c];
      },
    });
    container.appendChild(root);

    const menu = root.querySelector('[role="menu"]') as HTMLElement;
    expect(menu.className).toContain(styles.content);
  });

  it('applies theme classes to items', async () => {
    const { createThemedContextMenu } = await import('../components/primitives/context-menu');
    const styles = createContextMenuStyles();
    const ContextMenu = createThemedContextMenu(styles);

    const root = ContextMenu({
      children: () => {
        const t = ContextMenu.Trigger({
          children: [document.createTextNode('Right-click')],
        });
        const c = ContextMenu.Content({
          children: () => [ContextMenu.Item({ value: 'edit', children: ['Edit'] })],
        });
        return [t, c];
      },
    });
    container.appendChild(root);

    const item = root.querySelector('[role="menuitem"]') as HTMLElement;
    expect(item.className).toContain(styles.item);
  });

  it('applies theme classes to groups', async () => {
    const { createThemedContextMenu } = await import('../components/primitives/context-menu');
    const styles = createContextMenuStyles();
    const ContextMenu = createThemedContextMenu(styles);

    const root = ContextMenu({
      children: () => {
        const t = ContextMenu.Trigger({
          children: [document.createTextNode('Trigger')],
        });
        const c = ContextMenu.Content({
          children: () => [
            ContextMenu.Group({
              label: 'Actions',
              children: () => [ContextMenu.Item({ value: 'cut', children: ['Cut'] })],
            }),
          ],
        });
        return [t, c];
      },
    });
    container.appendChild(root);

    const group = root.querySelector('[role="group"]') as HTMLElement;
    expect(group.className).toContain(styles.group);
  });

  it('applies theme classes to separators', async () => {
    const { createThemedContextMenu } = await import('../components/primitives/context-menu');
    const styles = createContextMenuStyles();
    const ContextMenu = createThemedContextMenu(styles);

    const root = ContextMenu({
      children: () => {
        const t = ContextMenu.Trigger({
          children: [document.createTextNode('Trigger')],
        });
        const c = ContextMenu.Content({
          children: () => [
            ContextMenu.Item({ value: 'a', children: ['A'] }),
            ContextMenu.Separator({}),
            ContextMenu.Item({ value: 'b', children: ['B'] }),
          ],
        });
        return [t, c];
      },
    });
    container.appendChild(root);

    const sep = root.querySelector('[role="separator"]') as HTMLElement;
    expect(sep.className).toContain(styles.separator);
  });

  it('applies theme classes to labels', async () => {
    const { createThemedContextMenu } = await import('../components/primitives/context-menu');
    const styles = createContextMenuStyles();
    const ContextMenu = createThemedContextMenu(styles);

    const root = ContextMenu({
      children: () => {
        const t = ContextMenu.Trigger({
          children: [document.createTextNode('Trigger')],
        });
        const c = ContextMenu.Content({
          children: () => [
            ContextMenu.Label({ children: ['My Account'] }),
            ContextMenu.Item({ value: 'a', children: ['A'] }),
          ],
        });
        return [t, c];
      },
    });
    container.appendChild(root);

    const labels = root.querySelectorAll('[role="none"]');
    const label = labels[0] as HTMLElement;
    expect(label.className).toContain(styles.label);
    expect(label.textContent).toBe('My Account');
  });

  it('preserves primitive behavior — contextmenu event opens menu', async () => {
    const { createThemedContextMenu } = await import('../components/primitives/context-menu');
    const styles = createContextMenuStyles();
    const ContextMenu = createThemedContextMenu(styles);

    const root = ContextMenu({
      children: () => {
        const t = ContextMenu.Trigger({
          children: [document.createTextNode('Right-click me')],
        });
        const c = ContextMenu.Content({
          children: () => [ContextMenu.Item({ value: 'a', children: ['A'] })],
        });
        return [t, c];
      },
    });
    container.appendChild(root);

    const menu = root.querySelector('[role="menu"]') as HTMLElement;
    expect(menu.getAttribute('data-state')).toBe('closed');

    const trigger = root.querySelector('[data-part="trigger"]') as HTMLElement;
    trigger.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 100, clientY: 200, bubbles: true }),
    );
    expect(menu.getAttribute('data-state')).toBe('open');
  });

  it('preserves primitive behavior — onSelect callback', async () => {
    const { createThemedContextMenu } = await import('../components/primitives/context-menu');
    const styles = createContextMenuStyles();
    const onSelect = vi.fn();
    const ContextMenu = createThemedContextMenu(styles);

    const root = ContextMenu({
      onSelect,
      children: () => {
        const t = ContextMenu.Trigger({
          children: [document.createTextNode('Trigger')],
        });
        const c = ContextMenu.Content({
          children: () => [ContextMenu.Item({ value: 'edit', children: ['Edit'] })],
        });
        return [t, c];
      },
    });
    container.appendChild(root);

    // Open the menu
    const trigger = root.querySelector('[data-part="trigger"]') as HTMLElement;
    trigger.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 100, clientY: 200, bubbles: true }),
    );

    // Click the item
    const item = root.querySelector('[data-value="edit"]') as HTMLElement;
    item.click();
    expect(onSelect).toHaveBeenCalledWith('edit');
  });
});
