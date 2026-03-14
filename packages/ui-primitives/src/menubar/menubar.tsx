/**
 * Menubar primitive - horizontal menu bar with multiple dropdown menus.
 * Follows WAI-ARIA menubar pattern with cross-menu keyboard navigation.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { createDismiss } from '../utils/dismiss';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition } from '../utils/floating';
import { setRovingTabindex } from '../utils/focus';
import { linkedIds } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

export interface MenubarOptions extends ElementAttrs {
  onSelect?: (value: string) => void;
  positioning?: FloatingOptions;
}

export interface MenubarState {
  activeMenu: Signal<string | null>;
}

export interface MenubarElements {
  root: HTMLDivElement;
}

function MenubarRoot(options: MenubarOptions = {}): MenubarElements & {
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
  const { onSelect, positioning, ...attrs } = options;
  const state: MenubarState = { activeMenu: signal<string | null>(null) };
  const triggers: HTMLButtonElement[] = [];
  const menus: Map<
    string,
    { trigger: HTMLButtonElement; content: HTMLDivElement; items: HTMLDivElement[] }
  > = new Map();
  let floatingCleanup: (() => void) | null = null;
  let dismissCleanup: (() => void) | null = null;

  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as Node;
    if (!root.contains(target)) {
      closeAll();
    }
  }

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
      if (!dismissCleanup) {
        dismissCleanup = createDismiss({
          onDismiss: closeAll,
          insideElements: [root],
          escapeKey: false,
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

  const root = (
    <div
      role="menubar"
      onKeydown={(event: KeyboardEvent) => {
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
      }}
    />
  ) as HTMLDivElement;

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
    const menuItems: HTMLDivElement[] = [];

    const trigger = (
      <button
        type="button"
        role="menuitem"
        id={ids.triggerId}
        aria-controls={ids.contentId}
        aria-haspopup="menu"
        data-value={value}
        aria-expanded="false"
        data-state="closed"
        onClick={() => {
          if (state.activeMenu.peek() === value) {
            closeAll();
          } else {
            openMenu(value);
          }
        }}
        onKeydown={(event: KeyboardEvent) => {
          if (isKey(event, Keys.ArrowDown, Keys.Enter, Keys.Space)) {
            event.preventDefault();
            openMenu(value);
          }
        }}
      >
        {label ?? value}
      </button>
    ) as HTMLButtonElement;

    setRovingTabindex(triggers.concat(trigger), triggers.length);

    const content = (
      <div
        role="menu"
        id={ids.contentId}
        aria-hidden="true"
        data-state="closed"
        style="display: none"
        onKeydown={(event: KeyboardEvent) => {
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
            const activeItem = menuItems.find((item) => item === active);
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

          handleListNavigation(event, menuItems, { orientation: 'vertical' });
        }}
      />
    ) as HTMLDivElement;

    function createItem(val: string, itemLabel?: string, parent?: HTMLElement): HTMLDivElement {
      const item = (
        <div
          role="menuitem"
          data-value={val}
          tabindex="-1"
          onClick={() => {
            onSelect?.(val);
            closeAll();
            trigger.focus();
          }}
        >
          {itemLabel ?? val}
        </div>
      ) as HTMLDivElement;

      menuItems.push(item);
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
      const el = (<div role="group" aria-label={groupLabel} />) as HTMLDivElement;
      content.appendChild(el);
      return {
        el,
        Item: (val: string, l?: string) => createItem(val, l, el),
      };
    }

    function Separator(): HTMLHRElement {
      const hr = (<hr role="separator" />) as HTMLHRElement;
      content.appendChild(hr);
      return hr;
    }

    triggers.push(trigger);
    setRovingTabindex(triggers, 0);
    menus.set(value, { trigger, content, items: menuItems });
    root.appendChild(trigger);

    return { trigger, content, Item, Group, Separator };
  }

  applyAttrs(root, attrs);

  return { root, state, Menu };
}

export const Menubar: {
  Root: (options?: MenubarOptions) => MenubarElements & {
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
  };
} = {
  Root: MenubarRoot,
};
