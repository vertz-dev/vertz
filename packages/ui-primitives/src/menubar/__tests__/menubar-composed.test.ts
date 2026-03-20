import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { popScope, pushScope, runCleanups } from '@vertz/ui/internals';
import { ComposedMenubar } from '../menubar-composed';

describe('Composed Menubar', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  function renderMenubar(props?: { onSelect?: (value: string) => void }) {
    const root = ComposedMenubar({
      onSelect: props?.onSelect,
      children: () => {
        const file = ComposedMenubar.Menu({
          value: 'file',
          children: () => {
            const t = ComposedMenubar.Trigger({ children: ['File'] });
            const c = ComposedMenubar.Content({
              children: () => [
                ComposedMenubar.Item({ value: 'new', children: ['New'] }),
                ComposedMenubar.Item({ value: 'open', children: ['Open'] }),
              ],
            });
            return [t, c];
          },
        });
        const edit = ComposedMenubar.Menu({
          value: 'edit',
          children: () => {
            const t = ComposedMenubar.Trigger({ children: ['Edit'] });
            const c = ComposedMenubar.Content({
              children: () => [
                ComposedMenubar.Item({ value: 'undo', children: ['Undo'] }),
                ComposedMenubar.Item({ value: 'redo', children: ['Redo'] }),
              ],
            });
            return [t, c];
          },
        });
        return [file, edit];
      },
    });
    container.appendChild(root);
    return root;
  }

  describe('Given a Menubar with Menu, Trigger, Content, and Item sub-components', () => {
    describe('When rendered', () => {
      it('Then creates a menubar root with role="menubar"', () => {
        const root = renderMenubar();
        expect(root.getAttribute('role')).toBe('menubar');
      });

      it('Then creates triggers with role="menuitem" and aria-haspopup="menu"', () => {
        const root = renderMenubar();
        const triggers = root.querySelectorAll('[role="menuitem"][aria-haspopup="menu"]');
        expect(triggers.length).toBe(2);
        expect(triggers[0]!.textContent).toContain('File');
        expect(triggers[1]!.textContent).toContain('Edit');
      });

      it('Then creates content panels with role="menu"', () => {
        const root = renderMenubar();
        const menus = root.querySelectorAll('[role="menu"]');
        expect(menus.length).toBe(2);
      });

      it('Then content panels start hidden', () => {
        const root = renderMenubar();
        const menus = root.querySelectorAll('[role="menu"]');
        expect(menus[0]!.getAttribute('aria-hidden')).toBe('true');
        expect(menus[0]!.getAttribute('data-state')).toBe('closed');
      });
    });
  });

  describe('Given a Menubar with classes prop', () => {
    describe('When rendered', () => {
      it('Then applies classes to root, triggers, content, and items', () => {
        const root = ComposedMenubar({
          classes: {
            root: 'styled-root',
            trigger: 'styled-trigger',
            content: 'styled-content',
            item: 'styled-item',
          },
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

        expect(root.className).toContain('styled-root');

        const trigger = root.querySelector('[role="menuitem"]') as HTMLElement;
        expect(trigger.className).toContain('styled-trigger');

        const content = root.querySelector('[role="menu"]') as HTMLElement;
        expect(content.className).toContain('styled-content');

        const item = content.querySelector('[data-value="new"]') as HTMLElement;
        expect(item.className).toContain('styled-item');
      });
    });
  });

  describe('Given a Menubar trigger is clicked', () => {
    describe('When clicked once', () => {
      it('Then opens the corresponding menu', () => {
        const root = renderMenubar();
        const trigger = root.querySelector('[data-value="file"]') as HTMLElement;
        const content = root.querySelectorAll('[role="menu"]')[0] as HTMLElement;

        trigger.click();

        expect(content.getAttribute('data-state')).toBe('open');
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
      });
    });

    describe('When clicked again', () => {
      it('Then closes the menu', () => {
        const root = renderMenubar();
        const trigger = root.querySelector('[data-value="file"]') as HTMLElement;
        const content = root.querySelectorAll('[role="menu"]')[0] as HTMLElement;

        trigger.click();
        trigger.click();

        expect(content.getAttribute('data-state')).toBe('closed');
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
      });
    });
  });

  describe('Given a second trigger is clicked while a menu is open', () => {
    it('Then closes the first menu and opens the second', () => {
      const root = renderMenubar();
      const fileTrigger = root.querySelector('[data-value="file"]') as HTMLElement;
      const editTrigger = root.querySelector('[data-value="edit"]') as HTMLElement;
      const menus = root.querySelectorAll('[role="menu"]');
      const fileMenu = menus[0] as HTMLElement;
      const editMenu = menus[1] as HTMLElement;

      fileTrigger.click();
      expect(fileMenu.getAttribute('data-state')).toBe('open');

      editTrigger.click();
      expect(editMenu.getAttribute('data-state')).toBe('open');
      expect(fileMenu.getAttribute('data-state')).toBe('closed');
    });
  });

  describe('Given a menu is open and ArrowDown is pressed on a trigger', () => {
    it('Then opens the menu and focuses the first item', () => {
      const root = renderMenubar();
      const trigger = root.querySelector('[data-value="file"]') as HTMLElement;

      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      const content = root.querySelectorAll('[role="menu"]')[0] as HTMLElement;
      expect(content.getAttribute('data-state')).toBe('open');

      const firstItem = content.querySelector('[data-value="new"]') as HTMLElement;
      expect(document.activeElement).toBe(firstItem);
    });
  });

  describe('Given a menu is open and Escape is pressed in the content', () => {
    it('Then closes the menu and returns focus to the trigger', () => {
      const root = renderMenubar();
      const trigger = root.querySelector('[data-value="file"]') as HTMLElement;
      const content = root.querySelectorAll('[role="menu"]')[0] as HTMLElement;

      trigger.click();
      expect(content.getAttribute('data-state')).toBe('open');

      content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(content.getAttribute('data-state')).toBe('closed');
      expect(document.activeElement).toBe(trigger);
    });
  });

  describe('Given a menu is open and Enter is pressed on an item', () => {
    it('Then fires onSelect and closes the menu', () => {
      const onSelect = vi.fn();
      const root = renderMenubar({ onSelect });
      const trigger = root.querySelector('[data-value="file"]') as HTMLElement;
      const content = root.querySelectorAll('[role="menu"]')[0] as HTMLElement;

      trigger.click();
      const item = content.querySelector('[data-value="new"]') as HTMLElement;
      item.focus();
      content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(onSelect).toHaveBeenCalledWith('new');
      expect(content.getAttribute('data-state')).toBe('closed');
    });
  });

  describe('Given a menu item is clicked', () => {
    it('Then fires onSelect and closes the menu', () => {
      const onSelect = vi.fn();
      const root = renderMenubar({ onSelect });
      const trigger = root.querySelector('[data-value="file"]') as HTMLElement;
      const content = root.querySelectorAll('[role="menu"]')[0] as HTMLElement;

      trigger.click();
      const item = content.querySelector('[data-value="new"]') as HTMLElement;
      item.click();

      expect(onSelect).toHaveBeenCalledWith('new');
      expect(content.getAttribute('data-state')).toBe('closed');
    });
  });

  describe('Given ArrowRight is pressed in menu content', () => {
    it('Then closes the current menu and opens the next menu', () => {
      const root = renderMenubar();
      const fileContent = root.querySelectorAll('[role="menu"]')[0] as HTMLElement;
      const editContent = root.querySelectorAll('[role="menu"]')[1] as HTMLElement;
      const fileTrigger = root.querySelector('[data-value="file"]') as HTMLElement;

      fileTrigger.click();
      expect(fileContent.getAttribute('data-state')).toBe('open');

      fileContent.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      expect(editContent.getAttribute('data-state')).toBe('open');
      expect(fileContent.getAttribute('data-state')).toBe('closed');
    });
  });

  describe('Given ArrowLeft is pressed in menu content', () => {
    it('Then closes the current menu and opens the previous menu (wrapping)', () => {
      const root = renderMenubar();
      const fileContent = root.querySelectorAll('[role="menu"]')[0] as HTMLElement;
      const fileTrigger = root.querySelector('[data-value="file"]') as HTMLElement;

      fileTrigger.click();
      fileContent.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

      const editContent = root.querySelectorAll('[role="menu"]')[1] as HTMLElement;
      expect(editContent.getAttribute('data-state')).toBe('open');
      expect(fileContent.getAttribute('data-state')).toBe('closed');
    });
  });

  describe('Given click outside the menubar', () => {
    it('Then closes all menus', () => {
      const root = renderMenubar();
      const trigger = root.querySelector('[data-value="file"]') as HTMLElement;
      const content = root.querySelectorAll('[role="menu"]')[0] as HTMLElement;

      trigger.click();
      expect(content.getAttribute('data-state')).toBe('open');

      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      expect(content.getAttribute('data-state')).toBe('closed');
    });
  });

  describe('Given a Menubar with separator', () => {
    it('Then creates a separator element', () => {
      const root = ComposedMenubar({
        children: () => {
          const menu = ComposedMenubar.Menu({
            value: 'file',
            children: () => {
              const t = ComposedMenubar.Trigger({ children: ['File'] });
              const c = ComposedMenubar.Content({
                children: () => {
                  const i1 = ComposedMenubar.Item({ value: 'a', children: ['A'] });
                  const sep = ComposedMenubar.Separator({});
                  const i2 = ComposedMenubar.Item({ value: 'b', children: ['B'] });
                  return [i1, sep, i2];
                },
              });
              return [t, c];
            },
          });
          return [menu];
        },
      });
      container.appendChild(root);

      const separator = root.querySelector('[role="separator"]');
      expect(separator).not.toBeNull();
    });
  });

  describe('Given a Menubar with groups', () => {
    it('Then creates groups with items', () => {
      const root = ComposedMenubar({
        children: () => {
          const menu = ComposedMenubar.Menu({
            value: 'file',
            children: () => {
              const t = ComposedMenubar.Trigger({ children: ['File'] });
              const c = ComposedMenubar.Content({
                children: () => {
                  const g = ComposedMenubar.Group({
                    label: 'Actions',
                    children: () => [ComposedMenubar.Item({ value: 'cut', children: ['Cut'] })],
                  });
                  return [g];
                },
              });
              return [t, c];
            },
          });
          return [menu];
        },
      });
      container.appendChild(root);

      const group = root.querySelector('[role="group"]') as HTMLElement;
      expect(group).not.toBeNull();
      expect(group!.getAttribute('aria-label')).toBe('Actions');
    });
  });

  describe('Given a Menubar.Menu rendered outside Menubar', () => {
    it('Then throws an error', () => {
      expect(() => {
        ComposedMenubar.Menu({ value: 'test', children: ['Orphan'] });
      }).toThrow('<Menubar.Menu> must be used inside <Menubar>');
    });
  });

  describe('Given a Menubar.Trigger rendered outside Menubar.Menu', () => {
    it('Then throws an error', () => {
      expect(() => {
        ComposedMenubar.Trigger({ children: ['Orphan'] });
      }).toThrow('<Menubar.Trigger> must be used inside <Menubar.Menu>');
    });
  });

  describe('Given a Menubar.Content rendered outside Menubar.Menu', () => {
    it('Then throws an error', () => {
      expect(() => {
        ComposedMenubar.Content({ children: ['Orphan'] });
      }).toThrow('<Menubar.Content> must be used inside <Menubar.Menu>');
    });
  });

  describe('Given a Menubar with positioning prop', () => {
    it('Then content gets fixed positioning when opened', async () => {
      const root = ComposedMenubar({
        positioning: { placement: 'bottom-start' },
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
          return [file];
        },
      });
      container.appendChild(root);

      const trigger = root.querySelector('[data-value="file"]') as HTMLElement;
      trigger.click();
      // Wait for computePosition promise to resolve
      await new Promise((r) => setTimeout(r, 10));

      const content = root.querySelector('[role="menu"]') as HTMLElement;
      expect(content.getAttribute('data-state')).toBe('open');
      expect(content.style.position).toBe('fixed');
    });

    it('Then uses dismiss handler for click-outside instead of document listener', () => {
      const root = ComposedMenubar({
        positioning: { placement: 'bottom-start' },
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
          return [file];
        },
      });
      container.appendChild(root);

      const trigger = root.querySelector('[data-value="file"]') as HTMLElement;
      trigger.click();

      const content = root.querySelector('[role="menu"]') as HTMLElement;
      expect(content.getAttribute('data-state')).toBe('open');

      // Click outside should dismiss via the dismiss handler (uses pointerdown)
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      expect(content.getAttribute('data-state')).toBe('closed');
    });
  });

  describe('Given a Menubar rendered inside a disposal scope', () => {
    describe('When the disposal scope cleanups are run', () => {
      it('Then removeEventListener is called for the trigger handlers', () => {
        const scope = pushScope();
        const root = renderMenubar();
        popScope();

        const trigger = root.querySelector('[data-value="file"]') as HTMLElement;
        const spy = vi.spyOn(trigger, 'removeEventListener');
        runCleanups(scope);

        expect(spy).toHaveBeenCalledWith('click', expect.any(Function));
      });
    });
  });

  describe('Given ArrowRight on triggers when menu is open', () => {
    it('Then auto-switches to adjacent menu', () => {
      const root = renderMenubar();
      const fileTrigger = root.querySelector('[data-value="file"]') as HTMLElement;
      const fileContent = root.querySelectorAll('[role="menu"]')[0] as HTMLElement;
      const editContent = root.querySelectorAll('[role="menu"]')[1] as HTMLElement;

      fileTrigger.click();
      expect(fileContent.getAttribute('data-state')).toBe('open');

      fileTrigger.focus();
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      expect(editContent.getAttribute('data-state')).toBe('open');
      expect(fileContent.getAttribute('data-state')).toBe('closed');
    });
  });

  describe('Given Enter is pressed on a trigger', () => {
    it('Then opens the menu and focuses the first item', () => {
      const root = renderMenubar();
      const trigger = root.querySelector('[data-value="file"]') as HTMLElement;

      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      const content = root.querySelectorAll('[role="menu"]')[0] as HTMLElement;
      expect(content.getAttribute('data-state')).toBe('open');

      const firstItem = content.querySelector('[data-value="new"]') as HTMLElement;
      expect(document.activeElement).toBe(firstItem);
    });
  });

  describe('Given Space is pressed on a trigger', () => {
    it('Then opens the menu and focuses the first item', () => {
      const root = renderMenubar();
      const trigger = root.querySelector('[data-value="file"]') as HTMLElement;

      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

      const content = root.querySelectorAll('[role="menu"]')[0] as HTMLElement;
      expect(content.getAttribute('data-state')).toBe('open');

      const firstItem = content.querySelector('[data-value="new"]') as HTMLElement;
      expect(document.activeElement).toBe(firstItem);
    });
  });

  describe('Given a menu is open and ArrowDown is pressed in the content', () => {
    it('Then focuses the next menu item', () => {
      const root = renderMenubar();
      const trigger = root.querySelector('[data-value="file"]') as HTMLElement;
      const content = root.querySelectorAll('[role="menu"]')[0] as HTMLElement;

      trigger.click();
      const items = content.querySelectorAll('[role="menuitem"]');
      const firstItem = items[0] as HTMLElement;
      const secondItem = items[1] as HTMLElement;

      expect(document.activeElement).toBe(firstItem);

      content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(secondItem);
    });

    it('Then wraps around to the first item from the last', () => {
      const root = renderMenubar();
      const trigger = root.querySelector('[data-value="file"]') as HTMLElement;
      const content = root.querySelectorAll('[role="menu"]')[0] as HTMLElement;

      trigger.click();
      const items = content.querySelectorAll('[role="menuitem"]');
      const firstItem = items[0] as HTMLElement;
      const secondItem = items[1] as HTMLElement;

      // Move to second item
      content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(secondItem);

      // Wrap to first
      content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(firstItem);
    });
  });

  describe('Given a menu is open and ArrowUp is pressed in the content', () => {
    it('Then focuses the previous menu item', () => {
      const root = renderMenubar();
      const trigger = root.querySelector('[data-value="file"]') as HTMLElement;
      const content = root.querySelectorAll('[role="menu"]')[0] as HTMLElement;

      trigger.click();
      const items = content.querySelectorAll('[role="menuitem"]');
      const firstItem = items[0] as HTMLElement;
      const secondItem = items[1] as HTMLElement;

      // Move to second item first
      content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(secondItem);

      // ArrowUp back to first
      content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(document.activeElement).toBe(firstItem);
    });

    it('Then wraps around to the last item from the first', () => {
      const root = renderMenubar();
      const trigger = root.querySelector('[data-value="file"]') as HTMLElement;
      const content = root.querySelectorAll('[role="menu"]')[0] as HTMLElement;

      trigger.click();
      const items = content.querySelectorAll('[role="menuitem"]');
      const firstItem = items[0] as HTMLElement;
      const secondItem = items[1] as HTMLElement;

      expect(document.activeElement).toBe(firstItem);

      // Wrap to last
      content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(document.activeElement).toBe(secondItem);
    });
  });

  describe('Given a menu is open and Space is pressed on a focused item', () => {
    it('Then fires onSelect and closes the menu', () => {
      const onSelect = vi.fn();
      const root = renderMenubar({ onSelect });
      const trigger = root.querySelector('[data-value="file"]') as HTMLElement;
      const content = root.querySelectorAll('[role="menu"]')[0] as HTMLElement;

      trigger.click();
      const item = content.querySelector('[data-value="new"]') as HTMLElement;
      item.focus();
      content.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

      expect(onSelect).toHaveBeenCalledWith('new');
      expect(content.getAttribute('data-state')).toBe('closed');
    });
  });
});
