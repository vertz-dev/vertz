/**
 * Select primitive - listbox pattern with arrow key navigation.
 * Follows WAI-ARIA listbox pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setSelected } from '../utils/aria';
import { linkedIds } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

export interface SelectOptions {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

export interface SelectState {
  open: Signal<boolean>;
  value: Signal<string>;
  activeIndex: Signal<number>;
}

export interface SelectElements {
  trigger: HTMLButtonElement;
  content: HTMLDivElement;
}

export const Select = {
  Root(options: SelectOptions = {}): SelectElements & {
    state: SelectState;
    Item: (value: string, label?: string) => HTMLDivElement;
  } {
    const { defaultValue = '', onValueChange } = options;
    const ids = linkedIds('select');
    const state: SelectState = {
      open: signal(false),
      value: signal(defaultValue),
      activeIndex: signal(-1),
    };
    const items: HTMLDivElement[] = [];

    const trigger = document.createElement('button');
    trigger.setAttribute('type', 'button');
    trigger.setAttribute('role', 'combobox');
    trigger.id = ids.triggerId;
    trigger.setAttribute('aria-controls', ids.contentId);
    trigger.setAttribute('aria-haspopup', 'listbox');
    setExpanded(trigger, false);
    setDataState(trigger, 'closed');

    const content = document.createElement('div');
    content.setAttribute('role', 'listbox');
    content.id = ids.contentId;
    setHidden(content, true);
    setDataState(content, 'closed');

    function open(): void {
      state.open.value = true;
      setExpanded(trigger, true);
      setHidden(content, false);
      setDataState(trigger, 'open');
      setDataState(content, 'open');
      // Focus the first or selected item
      const selectedIdx = items.findIndex(
        (item) => item.getAttribute('data-value') === state.value.peek(),
      );
      const focusIdx = selectedIdx >= 0 ? selectedIdx : 0;
      state.activeIndex.value = focusIdx;
      updateActiveItem(focusIdx);
      items[focusIdx]?.focus();
    }

    function close(): void {
      state.open.value = false;
      setExpanded(trigger, false);
      setHidden(content, true);
      setDataState(trigger, 'closed');
      setDataState(content, 'closed');
      trigger.focus();
    }

    function selectItem(value: string): void {
      state.value.value = value;
      for (const item of items) {
        const isActive = item.getAttribute('data-value') === value;
        setSelected(item, isActive);
        setDataState(item, isActive ? 'active' : 'inactive');
      }
      onValueChange?.(value);
      close();
    }

    function updateActiveItem(index: number): void {
      for (let i = 0; i < items.length; i++) {
        items[i]?.setAttribute('tabindex', i === index ? '0' : '-1');
      }
    }

    trigger.addEventListener('click', () => {
      if (state.open.peek()) {
        close();
      } else {
        open();
      }
    });

    trigger.addEventListener('keydown', (event) => {
      if (isKey(event, Keys.ArrowDown, Keys.ArrowUp, Keys.Enter, Keys.Space)) {
        event.preventDefault();
        if (!state.open.peek()) {
          open();
        }
      }
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
          if (val !== null) selectItem(val);
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
      }
    });

    function Item(value: string, label?: string): HTMLDivElement {
      const item = document.createElement('div');
      item.setAttribute('role', 'option');
      item.setAttribute('data-value', value);
      item.setAttribute('tabindex', '-1');
      item.textContent = label ?? value;
      const isSelected = value === defaultValue;
      setSelected(item, isSelected);
      setDataState(item, isSelected ? 'active' : 'inactive');

      item.addEventListener('click', () => {
        selectItem(value);
      });

      items.push(item);
      content.appendChild(item);
      return item;
    }

    return { trigger, content, state, Item };
  },
};
