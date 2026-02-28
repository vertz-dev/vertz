/**
 * ContextMenu primitive - right-click context menu with keyboard navigation.
 * Follows WAI-ARIA menu pattern, triggered by contextmenu event.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setHidden, setHiddenAnimated } from '../utils/aria';
import { uniqueId } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

export interface ContextMenuOptions {
  onSelect?: (value: string) => void;
}

export interface ContextMenuState {
  open: Signal<boolean>;
  activeIndex: Signal<number>;
}

export interface ContextMenuElements {
  trigger: HTMLDivElement;
  content: HTMLDivElement;
}

export const ContextMenu = {
  Root(options: ContextMenuOptions = {}): ContextMenuElements & {
    state: ContextMenuState;
    Item: (value: string, label?: string) => HTMLDivElement;
    Group: (label: string) => {
      el: HTMLDivElement;
      Item: (value: string, label?: string) => HTMLDivElement;
    };
    Separator: () => HTMLHRElement;
    Label: (text: string) => HTMLDivElement;
  } {
    const { onSelect } = options;
    const state: ContextMenuState = {
      open: signal(false),
      activeIndex: signal(-1),
    };
    const items: HTMLDivElement[] = [];

    const trigger = document.createElement('div');
    const contentId = uniqueId('ctx-menu');

    const content = document.createElement('div');
    content.setAttribute('role', 'menu');
    content.id = contentId;
    content.style.position = 'fixed';
    setHidden(content, true);
    setDataState(content, 'closed');

    function handleClickOutside(event: MouseEvent): void {
      const target = event.target as Node;
      if (!trigger.contains(target) && !content.contains(target)) {
        close();
      }
    }

    function open(x: number, y: number): void {
      state.open.value = true;
      content.style.left = `${x}px`;
      content.style.top = `${y}px`;
      setHidden(content, false);
      setDataState(content, 'open');
      state.activeIndex.value = 0;
      updateActiveItem(0);
      items[0]?.focus();
      document.addEventListener('mousedown', handleClickOutside);
    }

    function close(): void {
      state.open.value = false;
      setDataState(content, 'closed');
      setHiddenAnimated(content, true);
      document.removeEventListener('mousedown', handleClickOutside);
    }

    function updateActiveItem(index: number): void {
      for (let i = 0; i < items.length; i++) {
        items[i]?.setAttribute('tabindex', i === index ? '0' : '-1');
      }
    }

    trigger.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      if (state.open.peek()) {
        close();
      }
      open(event.clientX, event.clientY);
    });

    content.addEventListener('keydown', (event) => {
      if (isKey(event, Keys.Escape)) {
        event.preventDefault();
        close();
        return;
      }

      if (isKey(event, Keys.Enter, Keys.Space)) {
        event.preventDefault();
        const active = items[state.activeIndex.peek()];
        if (active) {
          const val = active.getAttribute('data-value');
          if (val !== null) {
            onSelect?.(val);
            close();
          }
        }
        return;
      }

      const result = handleListNavigation(event, items, { orientation: 'vertical' });
      if (result) {
        const idx = items.indexOf(result as HTMLDivElement);
        if (idx >= 0) {
          state.activeIndex.value = idx;
          updateActiveItem(idx);
        }
        return;
      }

      // Type-ahead: single printable character focuses matching item
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const char = event.key.toLowerCase();
        const match = items.find((item) => item.textContent?.toLowerCase().startsWith(char));
        if (match) {
          const idx = items.indexOf(match);
          state.activeIndex.value = idx;
          updateActiveItem(idx);
          match.focus();
        }
      }
    });

    function createItem(value: string, label?: string, parent?: HTMLElement): HTMLDivElement {
      const item = document.createElement('div');
      item.setAttribute('role', 'menuitem');
      item.setAttribute('data-value', value);
      item.setAttribute('tabindex', '-1');
      item.textContent = label ?? value;

      item.addEventListener('click', () => {
        onSelect?.(value);
        close();
      });

      items.push(item);
      (parent ?? content).appendChild(item);
      return item;
    }

    function Item(value: string, label?: string): HTMLDivElement {
      return createItem(value, label);
    }

    function Group(label: string): {
      el: HTMLDivElement;
      Item: (value: string, label?: string) => HTMLDivElement;
    } {
      const el = document.createElement('div');
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', label);
      content.appendChild(el);
      return {
        el,
        Item: (value: string, itemLabel?: string) => createItem(value, itemLabel, el),
      };
    }

    function Separator(): HTMLHRElement {
      const hr = document.createElement('hr');
      hr.setAttribute('role', 'separator');
      content.appendChild(hr);
      return hr;
    }

    function Label(text: string): HTMLDivElement {
      const el = document.createElement('div');
      el.setAttribute('role', 'none');
      el.textContent = text;
      content.appendChild(el);
      return el;
    }

    return { trigger, content, state, Item, Group, Separator, Label };
  },
};
