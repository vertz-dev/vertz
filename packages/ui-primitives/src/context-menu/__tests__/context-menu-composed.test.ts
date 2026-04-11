import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from '@vertz/test';
import { popScope, pushScope, runCleanups } from '@vertz/ui/internals';

describe('Composed ContextMenu', () => {
  let container: HTMLDivElement;
  let ComposedContextMenu: typeof import('../context-menu-composed').ComposedContextMenu;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    ({ ComposedContextMenu } = await import('../context-menu-composed'));
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a ContextMenu with Trigger, Content, and Item sub-components', () => {
    describe('When rendered', () => {
      it('Then creates trigger and menu content with items', () => {
        const root = ComposedContextMenu({
          children: () => {
            const t = ComposedContextMenu.Trigger({
              children: [document.createTextNode('Right-click me')],
            });
            const c = ComposedContextMenu.Content({
              children: () => {
                const i1 = ComposedContextMenu.Item({ value: 'edit', children: ['Edit'] });
                const i2 = ComposedContextMenu.Item({ value: 'delete', children: ['Delete'] });
                return [i1, i2];
              },
            });
            return [t, c];
          },
        });
        container.appendChild(root);

        const menu = root.querySelector('[role="menu"]');
        expect(menu).not.toBeNull();

        const items = root.querySelectorAll('[role="menuitem"]');
        expect(items.length).toBe(2);
      });
    });
  });

  describe('Given a ContextMenu with classes prop', () => {
    describe('When rendered', () => {
      it('Then applies classes to content and items', () => {
        const root = ComposedContextMenu({
          classes: { content: 'styled-content', item: 'styled-item' },
          children: () => {
            const t = ComposedContextMenu.Trigger({
              children: [document.createTextNode('Trigger')],
            });
            const c = ComposedContextMenu.Content({
              children: () => {
                const i1 = ComposedContextMenu.Item({ value: 'a', children: ['A'] });
                return [i1];
              },
            });
            return [t, c];
          },
        });
        container.appendChild(root);

        const menu = root.querySelector('[role="menu"]') as HTMLElement;
        expect(menu.className).toContain('styled-content');

        const item = menu.querySelector('[role="menuitem"]') as HTMLElement;
        expect(item.className).toContain('styled-item');
      });
    });
  });

  describe('Given a ContextMenu trigger area', () => {
    describe('When a contextmenu event fires on the trigger', () => {
      it('Then opens the menu', () => {
        const root = ComposedContextMenu({
          positioning: { strategy: 'fixed' },
          children: () => {
            const t = ComposedContextMenu.Trigger({
              children: [document.createTextNode('Right-click me')],
            });
            const c = ComposedContextMenu.Content({
              children: () => [ComposedContextMenu.Item({ value: 'a', children: ['A'] })],
            });
            return [t, c];
          },
        });
        container.appendChild(root);

        const trigger = root.querySelector('[data-part="trigger"]') as HTMLElement;
        expect(trigger).not.toBeNull();

        // Menu should be hidden initially
        const menu = root.querySelector('[role="menu"]') as HTMLElement;
        expect(menu.getAttribute('data-state')).toBe('closed');

        // Right-click
        trigger.dispatchEvent(
          new MouseEvent('contextmenu', { clientX: 100, clientY: 200, bubbles: true }),
        );

        expect(menu.getAttribute('data-state')).toBe('open');
      });
    });
  });

  describe('Given a ContextMenu.Trigger rendered outside ContextMenu', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedContextMenu.Trigger({ children: ['Orphan'] });
        }).toThrow('<ContextMenu.Trigger> must be used inside <ContextMenu>');
      });
    });
  });

  describe('Given a ContextMenu.Content rendered outside ContextMenu', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedContextMenu.Content({ children: ['Orphan'] });
        }).toThrow('<ContextMenu.Content> must be used inside <ContextMenu>');
      });
    });
  });

  describe('Given a ContextMenu with groups', () => {
    it('Then creates groups with aria-label', () => {
      const root = ComposedContextMenu({
        children: () => {
          const t = ComposedContextMenu.Trigger({
            children: [document.createTextNode('Trigger')],
          });
          const c = ComposedContextMenu.Content({
            children: () => {
              const g = ComposedContextMenu.Group({
                label: 'Actions',
                children: () => [ComposedContextMenu.Item({ value: 'cut', children: ['Cut'] })],
              });
              return [g];
            },
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      const group = root.querySelector('[role="group"]') as HTMLElement;
      expect(group).not.toBeNull();
      expect(group.getAttribute('aria-label')).toBe('Actions');
    });
  });

  describe('Given a ContextMenu with separator', () => {
    it('Then creates a separator element', () => {
      const root = ComposedContextMenu({
        children: () => {
          const t = ComposedContextMenu.Trigger({
            children: [document.createTextNode('Trigger')],
          });
          const c = ComposedContextMenu.Content({
            children: () => {
              const i1 = ComposedContextMenu.Item({ value: 'a', children: ['A'] });
              const sep = ComposedContextMenu.Separator({});
              const i2 = ComposedContextMenu.Item({ value: 'b', children: ['B'] });
              return [i1, sep, i2];
            },
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      const separator = root.querySelector('[role="separator"]') as HTMLElement;
      expect(separator).not.toBeNull();
    });
  });

  describe('Given a ContextMenu with label', () => {
    it('Then creates a label element', () => {
      const root = ComposedContextMenu({
        children: () => {
          const t = ComposedContextMenu.Trigger({
            children: [document.createTextNode('Trigger')],
          });
          const c = ComposedContextMenu.Content({
            children: () => {
              const label = ComposedContextMenu.Label({ children: ['Menu Label'] });
              const i1 = ComposedContextMenu.Item({ value: 'a', children: ['A'] });
              return [label, i1];
            },
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      const menu = root.querySelector('[role="menu"]') as HTMLElement;
      expect(menu.textContent).toContain('Menu Label');
    });
  });

  describe('Given a ContextMenu with onSelect callback', () => {
    it('Then fires onSelect when an item is clicked', () => {
      const selected: string[] = [];

      const root = ComposedContextMenu({
        onSelect: (value) => selected.push(value),
        children: () => {
          const t = ComposedContextMenu.Trigger({
            children: [document.createTextNode('Trigger')],
          });
          const c = ComposedContextMenu.Content({
            children: () => [
              ComposedContextMenu.Item({ value: 'edit', children: ['Edit'] }),
              ComposedContextMenu.Item({ value: 'delete', children: ['Delete'] }),
            ],
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

      // Click the first item
      const item = root.querySelector('[data-value="edit"]') as HTMLElement;
      item.click();
      expect(selected).toEqual(['edit']);
    });
  });

  describe('Given a ContextMenu rendered inside a disposal scope', () => {
    describe('When the disposal scope cleanups are run', () => {
      it('Then removeEventListener is called for the contextmenu handler', () => {
        const scope = pushScope();

        const root = ComposedContextMenu({
          children: () => {
            const t = ComposedContextMenu.Trigger({
              children: [document.createTextNode('Trigger')],
            });
            const c = ComposedContextMenu.Content({
              children: () => [ComposedContextMenu.Item({ value: 'a', children: ['A'] })],
            });
            return [t, c];
          },
        });
        container.appendChild(root);
        popScope();

        const trigger = root.querySelector('[data-part="trigger"]') as HTMLElement;
        const spy = spyOn(trigger, 'removeEventListener');
        runCleanups(scope);

        expect(spy).toHaveBeenCalledWith('contextmenu', expect.any(Function));
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Keyboard navigation tests (#1527)
  // ---------------------------------------------------------------------------

  function renderMenuWithItems(onSelect?: (value: string) => void) {
    const root = ComposedContextMenu({
      onSelect,
      children: () => {
        const t = ComposedContextMenu.Trigger({
          children: [document.createTextNode('Right-click me')],
        });
        const c = ComposedContextMenu.Content({
          children: () => [
            ComposedContextMenu.Item({ value: 'cut', children: ['Cut'] }),
            ComposedContextMenu.Item({ value: 'copy', children: ['Copy'] }),
            ComposedContextMenu.Item({ value: 'paste', children: ['Paste'] }),
          ],
        });
        return [t, c];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('[data-part="trigger"]') as HTMLElement;
    const menu = root.querySelector('[role="menu"]') as HTMLElement;

    function openMenu() {
      trigger.dispatchEvent(
        new MouseEvent('contextmenu', { clientX: 100, clientY: 200, bubbles: true }),
      );
    }

    return { root, trigger, menu, openMenu };
  }

  describe('Given an open ContextMenu with multiple items', () => {
    describe('When ArrowDown is pressed', () => {
      it('Then moves focus to the next menu item', () => {
        const { menu, openMenu } = renderMenuWithItems();
        openMenu();

        const items = menu.querySelectorAll('[role="menuitem"]');
        (items[0] as HTMLElement).focus();

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

        expect(document.activeElement).toBe(items[1]);
      });
    });

    describe('When ArrowUp is pressed', () => {
      it('Then moves focus to the previous menu item', () => {
        const { menu, openMenu } = renderMenuWithItems();
        openMenu();

        const items = menu.querySelectorAll('[role="menuitem"]');
        (items[1] as HTMLElement).focus();

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

        expect(document.activeElement).toBe(items[0]);
      });
    });

    describe('When Enter is pressed on a focused item', () => {
      it('Then selects the focused item and closes the menu', () => {
        const onSelect = mock();
        const { menu, openMenu } = renderMenuWithItems(onSelect);
        openMenu();

        const items = menu.querySelectorAll('[role="menuitem"]');
        (items[1] as HTMLElement).focus();

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

        expect(onSelect).toHaveBeenCalledWith('copy');
        expect(menu.getAttribute('data-state')).toBe('closed');
      });
    });

    describe('When Escape is pressed', () => {
      it('Then closes the menu without selection', () => {
        const onSelect = mock();
        const { menu, openMenu } = renderMenuWithItems(onSelect);
        openMenu();

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(onSelect).not.toHaveBeenCalled();
        expect(menu.getAttribute('data-state')).toBe('closed');
      });
    });

    describe('When Tab is pressed', () => {
      it('Then closes the menu', () => {
        const onSelect = mock();
        const { menu, openMenu } = renderMenuWithItems(onSelect);
        openMenu();

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));

        expect(onSelect).not.toHaveBeenCalled();
        expect(menu.getAttribute('data-state')).toBe('closed');
      });
    });
  });

  describe('Given a ContextMenu with duplicate Content sub-components', () => {
    it('Then warns about the duplicate', () => {
      const spy = spyOn(console, 'warn').mockImplementation(() => {});

      ComposedContextMenu({
        children: () => {
          const t = ComposedContextMenu.Trigger({
            children: [document.createTextNode('Trigger')],
          });
          const c1 = ComposedContextMenu.Content({
            children: () => [ComposedContextMenu.Item({ value: 'a', children: ['A'] })],
          });
          const c2 = ComposedContextMenu.Content({
            children: () => [ComposedContextMenu.Item({ value: 'b', children: ['B'] })],
          });
          return [t, c1, c2];
        },
      });

      expect(spy).toHaveBeenCalledWith(
        'Duplicate <ContextMenu.Content> detected – only the first is used',
      );
      spy.mockRestore();
    });
  });
});
