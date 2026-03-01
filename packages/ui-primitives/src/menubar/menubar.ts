/**
 * Menubar primitive - horizontal menu bar with multiple dropdown menus.
 * Follows WAI-ARIA menubar pattern with cross-menu keyboard navigation.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import { createDismiss } from '../utils/dismiss';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition } from '../utils/floating';
import { setRovingTabindex } from '../utils/focus';
import { linkedIds } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

export interface MenubarOptions {
  onSelect?: (value: string) => void;
  positioning?: FloatingOptions;
}

export interface MenubarState {
  activeMenu: Signal<string | null>;
}

export interface MenubarElements {
  root: HTMLDivElement;
}

export const Menubar = {
  Root(options: MenubarOptions = {}): MenubarElements & {
    state: MenubarState;
    Menu: (
      value: string,
      label?: string,
    ) => {
      trigger: HTMLButtonElement;
      content: HTMLDivElement;
      Item: (value: string, label?: string) => HTMLDivElement;
      Group: (label: string) => {
        el: HTMLDivElement;
        Item: (value: string, label?: string) => HTMLDivElement;
      };
      Separator: () => HTMLHRElement;
    };
  } {
    const { onSelect, positioning } = options;
    const state: MenubarState = { activeMenu: signal<string | null>(null) };
    const triggers: HTMLButtonElement[] = [];
    const menus: Map<
      string,
      { trigger: HTMLButtonElement; content: HTMLDivElement; items: HTMLDivElement[] }
    > = new Map();
    let floatingCleanup: (() => void) | null = null;
    let dismissCleanup: (() => void) | null = null;

    const root = document.createElement('div');
    root.setAttribute('role', 'menubar');

    function closeAll(): void {
      for (const [, menu] of menus) {
        setExpanded(menu.trigger, false);
        setDataState(menu.trigger, 'closed');
        setDataState(menu.content, 'closed');
        setHiddenAnimated(menu.content, true);
      }
      state.activeMenu.value = null;

      if (positioning) {
        floatingCleanup?.();
        floatingCleanup = null;
        dismissCleanup?.();
        dismissCleanup = null;
      } else {
        document.removeEventListener('mousedown', handleClickOutside);
      }
    }

    function openMenu(value: string): void {
      const current = state.activeMenu.peek();
      if (current && current !== value) {
        const prev = menus.get(current);
        if (prev) {
          setExpanded(prev.trigger, false);
          setDataState(prev.trigger, 'closed');
          setDataState(prev.content, 'closed');
          setHiddenAnimated(prev.content, true);
        }
        // Clean up previous floating if switching menus
        if (positioning) {
          floatingCleanup?.();
          floatingCleanup = null;
        }
      }

      const menu = menus.get(value);
      if (!menu) return;
      state.activeMenu.value = value;
      setExpanded(menu.trigger, true);
      setHidden(menu.content, false);
      setDataState(menu.trigger, 'open');
      setDataState(menu.content, 'open');

      if (positioning) {
        const result = createFloatingPosition(menu.trigger, menu.content, positioning);
        floatingCleanup = result.cleanup;
        // Only set up dismiss once for the menubar
        if (!dismissCleanup) {
          dismissCleanup = createDismiss({
            onDismiss: closeAll,
            insideElements: [root],
            escapeKey: false, // Escape handled by content keydown
          });
        }
      } else {
        document.addEventListener('mousedown', handleClickOutside);
      }

      const firstItem = menu.items[0];
      if (firstItem) {
        firstItem.setAttribute('tabindex', '0');
        firstItem.focus();
      }
    }

    function handleClickOutside(event: MouseEvent): void {
      const target = event.target as Node;
      if (!root.contains(target)) {
        closeAll();
      }
    }

    root.addEventListener('keydown', (event) => {
      if (isKey(event, Keys.ArrowLeft, Keys.ArrowRight, Keys.Home, Keys.End)) {
        const focused = document.activeElement;
        const triggerIndex = triggers.indexOf(focused as HTMLButtonElement);

        if (triggerIndex >= 0) {
          const result = handleListNavigation(event, triggers, { orientation: 'horizontal' });
          if (result && state.activeMenu.peek()) {
            const newTrigger = result as HTMLButtonElement;
            const menuValue = newTrigger.getAttribute('data-value');
            if (menuValue) openMenu(menuValue);
          }
        }
      }
    });

    function Menu(
      value: string,
      label?: string,
    ): {
      trigger: HTMLButtonElement;
      content: HTMLDivElement;
      Item: (value: string, label?: string) => HTMLDivElement;
      Group: (label: string) => {
        el: HTMLDivElement;
        Item: (value: string, label?: string) => HTMLDivElement;
      };
      Separator: () => HTMLHRElement;
    } {
      const ids = linkedIds('menubar-menu');
      const items: HTMLDivElement[] = [];

      const trigger = document.createElement('button');
      trigger.setAttribute('type', 'button');
      trigger.setAttribute('role', 'menuitem');
      trigger.id = ids.triggerId;
      trigger.setAttribute('aria-controls', ids.contentId);
      trigger.setAttribute('aria-haspopup', 'menu');
      trigger.setAttribute('data-value', value);
      trigger.textContent = label ?? value;
      setExpanded(trigger, false);
      setDataState(trigger, 'closed');
      setRovingTabindex(triggers.concat(trigger), triggers.length);

      const content = document.createElement('div');
      content.setAttribute('role', 'menu');
      content.id = ids.contentId;
      setHidden(content, true);
      setDataState(content, 'closed');

      trigger.addEventListener('click', () => {
        if (state.activeMenu.peek() === value) {
          closeAll();
        } else {
          openMenu(value);
        }
      });

      trigger.addEventListener('keydown', (event) => {
        if (isKey(event, Keys.ArrowDown, Keys.Enter, Keys.Space)) {
          event.preventDefault();
          openMenu(value);
        }
      });

      content.addEventListener('keydown', (event) => {
        if (isKey(event, Keys.Escape)) {
          event.preventDefault();
          event.stopPropagation();
          closeAll();
          trigger.focus();
          return;
        }

        if (isKey(event, Keys.Enter, Keys.Space)) {
          event.preventDefault();
          const active = document.activeElement;
          const activeItem = items.find((item) => item === active);
          if (activeItem) {
            const val = activeItem.getAttribute('data-value');
            if (val !== null) {
              onSelect?.(val);
              closeAll();
              trigger.focus();
            }
          }
          return;
        }

        if (isKey(event, Keys.ArrowLeft, Keys.ArrowRight)) {
          event.preventDefault();
          const triggerIdx = triggers.indexOf(trigger);
          let nextIdx: number;
          if (isKey(event, Keys.ArrowRight)) {
            nextIdx = (triggerIdx + 1) % triggers.length;
          } else {
            nextIdx = (triggerIdx - 1 + triggers.length) % triggers.length;
          }
          const nextTrigger = triggers[nextIdx];
          if (nextTrigger) {
            nextTrigger.focus();
            const nextValue = nextTrigger.getAttribute('data-value');
            if (nextValue) openMenu(nextValue);
          }
          return;
        }

        handleListNavigation(event, items, { orientation: 'vertical' });
      });

      function createItem(val: string, itemLabel?: string, parent?: HTMLElement): HTMLDivElement {
        const item = document.createElement('div');
        item.setAttribute('role', 'menuitem');
        item.setAttribute('data-value', val);
        item.setAttribute('tabindex', '-1');
        item.textContent = itemLabel ?? val;

        item.addEventListener('click', () => {
          onSelect?.(val);
          closeAll();
          trigger.focus();
        });

        items.push(item);
        (parent ?? content).appendChild(item);
        return item;
      }

      function Item(val: string, itemLabel?: string): HTMLDivElement {
        return createItem(val, itemLabel);
      }

      function Group(groupLabel: string): {
        el: HTMLDivElement;
        Item: (value: string, label?: string) => HTMLDivElement;
      } {
        const el = document.createElement('div');
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', groupLabel);
        content.appendChild(el);
        return {
          el,
          Item: (val: string, l?: string) => createItem(val, l, el),
        };
      }

      function Separator(): HTMLHRElement {
        const hr = document.createElement('hr');
        hr.setAttribute('role', 'separator');
        content.appendChild(hr);
        return hr;
      }

      triggers.push(trigger);
      setRovingTabindex(triggers, 0);
      menus.set(value, { trigger, content, items });
      root.appendChild(trigger);

      return { trigger, content, Item, Group, Separator };
    }

    return { root, state, Menu };
  },
};
