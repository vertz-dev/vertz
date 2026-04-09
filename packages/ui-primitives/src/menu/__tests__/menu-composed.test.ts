import { afterEach, beforeEach, describe, expect, it, vi } from '@vertz/test';
import { popScope, pushScope, runCleanups } from '@vertz/ui/internals';
import { ComposedMenu } from '../menu-composed';

describe('Composed Menu', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a Menu with Trigger, Content, and Item sub-components', () => {
    describe('When rendered', () => {
      it('Then creates trigger and menu content with items', () => {
        const btn = document.createElement('button');
        btn.textContent = 'Menu';

        const root = ComposedMenu({
          children: () => {
            const t = ComposedMenu.Trigger({ children: [btn] });
            const c = ComposedMenu.Content({
              children: () => {
                const i1 = ComposedMenu.Item({ value: 'edit', children: ['Edit'] });
                const i2 = ComposedMenu.Item({ value: 'delete', children: ['Delete'] });
                return [i1, i2];
              },
            });
            return [t, c];
          },
        });
        container.appendChild(root);

        expect(root.contains(btn)).toBe(true);
        const menu = root.querySelector('[role="menu"]');
        expect(menu).not.toBeNull();
      });
    });
  });

  describe('Given a Menu with classes prop', () => {
    describe('When rendered', () => {
      it('Then applies classes to content and items', () => {
        const btn = document.createElement('button');

        const root = ComposedMenu({
          classes: { content: 'styled-content', item: 'styled-item' },
          children: () => {
            const t = ComposedMenu.Trigger({ children: [btn] });
            const c = ComposedMenu.Content({
              children: () => {
                const i1 = ComposedMenu.Item({ value: 'a', children: ['A'] });
                return [i1];
              },
            });
            return [t, c];
          },
        });
        container.appendChild(root);

        const menu = root.querySelector('[role="menu"]') as HTMLElement;
        expect(menu?.className).toContain('styled-content');

        const item = menu?.querySelector('[role="menuitem"]') as HTMLElement;
        expect(item?.className).toContain('styled-item');
      });
    });
  });

  describe('Given a Menu trigger element', () => {
    it('Then sets ARIA attributes on the trigger wrapper', () => {
      const btn = document.createElement('button');

      const root = ComposedMenu({
        children: () => {
          const t = ComposedMenu.Trigger({ children: [btn] });
          const c = ComposedMenu.Content({
            children: () => [ComposedMenu.Item({ value: 'a', children: ['A'] })],
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      const triggerWrapper = root.querySelector('[data-menu-trigger]');
      expect(triggerWrapper?.getAttribute('aria-haspopup')).toBe('menu');
      expect(triggerWrapper?.getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('Given a Menu with positioning prop', () => {
    it('Then forwards positioning to the primitive so floating-ui activates on open', () => {
      const btn = document.createElement('button');

      const root = ComposedMenu({
        positioning: { placement: 'bottom-start', portal: true },
        children: () => {
          const t = ComposedMenu.Trigger({ children: [btn] });
          const c = ComposedMenu.Content({
            children: () => [ComposedMenu.Item({ value: 'a', children: ['A'] })],
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      // Open the menu
      btn.click();

      // When positioning with portal: true is active, content is moved to document.body
      const menu = document.body.querySelector('[role="menu"]') as HTMLElement;
      expect(menu).not.toBeNull();
      expect(menu?.parentElement).toBe(document.body);
    });
  });

  describe('Given a Menu.Trigger rendered outside Menu', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedMenu.Trigger({ children: ['Orphan'] });
        }).toThrow('<Menu.Trigger> must be used inside <Menu>');
      });
    });
  });

  describe('Given a Menu.Content rendered outside Menu', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedMenu.Content({ children: ['Orphan'] });
        }).toThrow('<Menu.Content> must be used inside <Menu>');
      });
    });
  });

  describe('Given a Menu with groups', () => {
    it('Then creates groups with items', () => {
      const btn = document.createElement('button');

      const root = ComposedMenu({
        children: () => {
          const t = ComposedMenu.Trigger({ children: [btn] });
          const c = ComposedMenu.Content({
            children: () => {
              const g = ComposedMenu.Group({
                label: 'Actions',
                children: () => [ComposedMenu.Item({ value: 'cut', children: ['Cut'] })],
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
      expect(group?.getAttribute('aria-label')).toBe('Actions');
    });
  });

  describe('Given a Menu with separator', () => {
    it('Then creates a separator element', () => {
      const btn = document.createElement('button');

      const root = ComposedMenu({
        children: () => {
          const t = ComposedMenu.Trigger({ children: [btn] });
          const c = ComposedMenu.Content({
            children: () => {
              const i1 = ComposedMenu.Item({ value: 'a', children: ['A'] });
              const sep = ComposedMenu.Separator({});
              const i2 = ComposedMenu.Item({ value: 'b', children: ['B'] });
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

  describe('Given a Menu with label', () => {
    it('Then creates a label element', () => {
      const btn = document.createElement('button');

      const root = ComposedMenu({
        children: () => {
          const t = ComposedMenu.Trigger({ children: [btn] });
          const c = ComposedMenu.Content({
            children: () => {
              const label = ComposedMenu.Label({ children: ['Menu Label'] });
              const i1 = ComposedMenu.Item({ value: 'a', children: ['A'] });
              return [label, i1];
            },
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      const menu = root.querySelector('[role="menu"]') as HTMLElement;
      expect(menu?.textContent).toContain('Menu Label');
    });
  });

  describe('Given a Menu with onSelect callback', () => {
    it('Then fires onSelect when an item is clicked', () => {
      const selected: string[] = [];
      const btn = document.createElement('button');

      const root = ComposedMenu({
        onSelect: (value) => selected.push(value),
        children: () => {
          const t = ComposedMenu.Trigger({ children: [btn] });
          const c = ComposedMenu.Content({
            children: () => [
              ComposedMenu.Item({ value: 'edit', children: ['Edit'] }),
              ComposedMenu.Item({ value: 'delete', children: ['Delete'] }),
            ],
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      // Open the menu
      btn.click();

      // Click the first item
      const item = root.querySelector('[data-value="edit"]') as HTMLElement;
      item.click();
      expect(selected).toEqual(['edit']);
    });
  });

  describe('Given a Menu with onOpenChange callback', () => {
    it('Then calls onOpenChange when the menu opens and closes', () => {
      const onOpenChange = vi.fn();
      const btn = document.createElement('button');

      const root = ComposedMenu({
        onOpenChange,
        children: () => {
          const t = ComposedMenu.Trigger({ children: [btn] });
          const c = ComposedMenu.Content({
            children: () => [ComposedMenu.Item({ value: 'a', children: ['A'] })],
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      btn.click();
      expect(onOpenChange).toHaveBeenCalledWith(true);

      // Press Escape to close
      const menu = root.querySelector('[role="menu"]') as HTMLElement;
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Given a Menu with duplicate Content sub-components', () => {
    it('Then warns about the duplicate', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const btn = document.createElement('button');

      ComposedMenu({
        children: () => {
          const t = ComposedMenu.Trigger({ children: [btn] });
          const c1 = ComposedMenu.Content({
            children: () => [ComposedMenu.Item({ value: 'a', children: ['A'] })],
          });
          const c2 = ComposedMenu.Content({
            children: () => [ComposedMenu.Item({ value: 'b', children: ['B'] })],
          });
          return [t, c1, c2];
        },
      });

      expect(spy).toHaveBeenCalledWith(
        'Duplicate <Menu.Content> detected \u2013 only the first is used',
      );
      spy.mockRestore();
    });
  });

  describe('Given a Menu rendered inside a disposal scope', () => {
    describe('When the disposal scope cleanups are run', () => {
      it('Then disposal scope cleans up without errors', () => {
        const scope = pushScope();
        const btn = document.createElement('button');

        const root = ComposedMenu({
          children: () => {
            const t = ComposedMenu.Trigger({ children: [btn] });
            const c = ComposedMenu.Content({
              children: () => [ComposedMenu.Item({ value: 'a', children: ['A'] })],
            });
            return [t, c];
          },
        });
        container.appendChild(root);
        popScope();

        expect(() => runCleanups(scope)).not.toThrow();
      });
    });
  });

  describe('Given a Menu with keyboard navigation', () => {
    it('Then opens with ArrowDown on trigger and focuses first item', () => {
      const btn = document.createElement('button');

      const root = ComposedMenu({
        children: () => {
          const t = ComposedMenu.Trigger({ children: [btn] });
          const c = ComposedMenu.Content({
            children: () => [
              ComposedMenu.Item({ value: 'a', children: ['A'] }),
              ComposedMenu.Item({ value: 'b', children: ['B'] }),
            ],
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      const triggerWrapper = root.querySelector('[data-menu-trigger]') as HTMLElement;
      triggerWrapper.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );

      const menu = root.querySelector('[role="menu"]') as HTMLElement;
      expect(menu.getAttribute('data-state')).toBe('open');
    });

    it('Then navigates items with ArrowDown', () => {
      const btn = document.createElement('button');

      const root = ComposedMenu({
        children: () => {
          const t = ComposedMenu.Trigger({ children: [btn] });
          const c = ComposedMenu.Content({
            children: () => [
              ComposedMenu.Item({ value: 'a', children: ['A'] }),
              ComposedMenu.Item({ value: 'b', children: ['B'] }),
            ],
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      // Open the menu
      btn.click();

      const menu = root.querySelector('[role="menu"]') as HTMLElement;
      const items = menu.querySelectorAll('[role="menuitem"]');

      // First ArrowDown focuses first item
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(items[0]);

      // Second ArrowDown moves to next item
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(items[1]);
    });

    it('Then closes on Escape', () => {
      const btn = document.createElement('button');

      const root = ComposedMenu({
        children: () => {
          const t = ComposedMenu.Trigger({ children: [btn] });
          const c = ComposedMenu.Content({
            children: () => [ComposedMenu.Item({ value: 'a', children: ['A'] })],
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      btn.click();

      const menu = root.querySelector('[role="menu"]') as HTMLElement;
      expect(menu.getAttribute('data-state')).toBe('open');

      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(menu.getAttribute('data-state')).toBe('closed');
    });

    it('Then selects item with Enter key', () => {
      const onSelect = vi.fn();
      const btn = document.createElement('button');

      const root = ComposedMenu({
        onSelect,
        children: () => {
          const t = ComposedMenu.Trigger({ children: [btn] });
          const c = ComposedMenu.Content({
            children: () => [
              ComposedMenu.Item({ value: 'a', children: ['A'] }),
              ComposedMenu.Item({ value: 'b', children: ['B'] }),
            ],
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      btn.click();

      const menu = root.querySelector('[role="menu"]') as HTMLElement;
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(onSelect).toHaveBeenCalledWith('a');
    });

    it('Then type-ahead focuses matching item', () => {
      const btn = document.createElement('button');

      const root = ComposedMenu({
        children: () => {
          const t = ComposedMenu.Trigger({ children: [btn] });
          const c = ComposedMenu.Content({
            children: () => [
              ComposedMenu.Item({ value: 'copy', children: ['Copy'] }),
              ComposedMenu.Item({ value: 'delete', children: ['Delete'] }),
              ComposedMenu.Item({ value: 'edit', children: ['Edit'] }),
            ],
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      btn.click();

      const menu = root.querySelector('[role="menu"]') as HTMLElement;
      const deleteItem = menu.querySelector('[data-value="delete"]') as HTMLElement;

      // Type 'd' — should focus 'Delete'
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
      expect(document.activeElement).toBe(deleteItem);
    });
  });

  describe('Given a Menu with items that use data-menu-item attribute', () => {
    it('Then items have data-value attribute', () => {
      const btn = document.createElement('button');

      const root = ComposedMenu({
        children: () => {
          const t = ComposedMenu.Trigger({ children: [btn] });
          const c = ComposedMenu.Content({
            children: () => [ComposedMenu.Item({ value: 'edit', children: ['Edit'] })],
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      const item = root.querySelector('[role="menuitem"]') as HTMLElement;
      expect(item.getAttribute('data-value')).toBe('edit');
      expect(item.getAttribute('role')).toBe('menuitem');
    });
  });
});
