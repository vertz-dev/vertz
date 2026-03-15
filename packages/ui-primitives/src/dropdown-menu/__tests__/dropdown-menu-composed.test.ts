import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ComposedDropdownMenu } from '../dropdown-menu-composed';

describe('Composed DropdownMenu', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a DropdownMenu with Trigger, Content, and Item sub-components', () => {
    describe('When rendered', () => {
      it('Then creates trigger and menu content with items', () => {
        const btn = document.createElement('button');
        btn.textContent = 'Menu';

        const root = ComposedDropdownMenu({
          children: () => {
            const t = ComposedDropdownMenu.Trigger({ children: [btn] });
            const c = ComposedDropdownMenu.Content({
              children: () => {
                const i1 = ComposedDropdownMenu.Item({ value: 'edit', children: ['Edit'] });
                const i2 = ComposedDropdownMenu.Item({ value: 'delete', children: ['Delete'] });
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

  describe('Given a DropdownMenu with classes prop', () => {
    describe('When rendered', () => {
      it('Then applies classes to content and items', () => {
        const btn = document.createElement('button');

        const root = ComposedDropdownMenu({
          classes: { content: 'styled-content', item: 'styled-item' },
          children: () => {
            const t = ComposedDropdownMenu.Trigger({ children: [btn] });
            const c = ComposedDropdownMenu.Content({
              children: () => {
                const i1 = ComposedDropdownMenu.Item({ value: 'a', children: ['A'] });
                return [i1];
              },
            });
            return [t, c];
          },
        });
        container.appendChild(root);

        const menu = root.querySelector('[role="menu"]') as HTMLElement;
        expect(menu!.className).toContain('styled-content');

        const item = menu!.querySelector('[role="menuitem"]') as HTMLElement;
        expect(item!.className).toContain('styled-item');
      });
    });
  });

  describe('Given a DropdownMenu trigger element', () => {
    it('Then sets ARIA attributes on the user trigger', () => {
      const btn = document.createElement('button');

      const root = ComposedDropdownMenu({
        children: () => {
          const t = ComposedDropdownMenu.Trigger({ children: [btn] });
          const c = ComposedDropdownMenu.Content({
            children: () => [ComposedDropdownMenu.Item({ value: 'a', children: ['A'] })],
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      expect(btn.getAttribute('aria-haspopup')).toBe('menu');
      expect(btn.getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('Given a DropdownMenu with groups', () => {
    it('Then creates groups with items', () => {
      const btn = document.createElement('button');

      const root = ComposedDropdownMenu({
        children: () => {
          const t = ComposedDropdownMenu.Trigger({ children: [btn] });
          const c = ComposedDropdownMenu.Content({
            children: () => {
              const g = ComposedDropdownMenu.Group({
                label: 'Actions',
                children: () => [ComposedDropdownMenu.Item({ value: 'cut', children: ['Cut'] })],
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
      expect(group!.getAttribute('aria-label')).toBe('Actions');
    });
  });

  describe('Given a DropdownMenu with separator', () => {
    it('Then creates a separator element', () => {
      const btn = document.createElement('button');

      const root = ComposedDropdownMenu({
        children: () => {
          const t = ComposedDropdownMenu.Trigger({ children: [btn] });
          const c = ComposedDropdownMenu.Content({
            children: () => {
              const i1 = ComposedDropdownMenu.Item({ value: 'a', children: ['A'] });
              const sep = ComposedDropdownMenu.Separator({});
              const i2 = ComposedDropdownMenu.Item({ value: 'b', children: ['B'] });
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

  describe('Given a DropdownMenu with label', () => {
    it('Then creates a label element', () => {
      const btn = document.createElement('button');

      const root = ComposedDropdownMenu({
        children: () => {
          const t = ComposedDropdownMenu.Trigger({ children: [btn] });
          const c = ComposedDropdownMenu.Content({
            children: () => {
              const label = ComposedDropdownMenu.Label({ children: ['Menu Label'] });
              const i1 = ComposedDropdownMenu.Item({ value: 'a', children: ['A'] });
              return [label, i1];
            },
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      // Menu.Root creates labels as divs inside the menu
      const menu = root.querySelector('[role="menu"]') as HTMLElement;
      expect(menu!.textContent).toContain('Menu Label');
    });
  });
});
