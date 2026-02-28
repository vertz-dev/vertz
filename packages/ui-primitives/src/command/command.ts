import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setHidden } from '../utils/aria';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export interface CommandOptions {
  filter?: (value: string, search: string) => boolean;
  onSelect?: (value: string) => void;
  onInputChange?: (value: string) => void;
  placeholder?: string;
}

export interface CommandState {
  inputValue: Signal<string>;
  activeIndex: Signal<number>;
}

export interface CommandElements {
  root: HTMLDivElement;
  input: HTMLInputElement;
  list: HTMLDivElement;
  empty: HTMLDivElement;
}

export const Command = {
  Root(options: CommandOptions = {}): CommandElements & {
    state: CommandState;
    Item: (value: string, label?: string, keywords?: string[]) => HTMLDivElement;
    Group: (label: string) => {
      el: HTMLDivElement;
      Item: (value: string, label?: string, keywords?: string[]) => HTMLDivElement;
    };
    Separator: () => HTMLHRElement;
  } {
    const { filter: customFilter, onSelect, onInputChange, placeholder } = options;
    const listId = uniqueId('command-list');
    const state: CommandState = {
      inputValue: signal(''),
      activeIndex: signal(0),
    };
    const allItems: HTMLDivElement[] = [];
    const groups: Map<HTMLDivElement, { heading: HTMLDivElement; items: HTMLDivElement[] }> =
      new Map();

    const root = document.createElement('div');

    const input = document.createElement('input');
    input.setAttribute('type', 'text');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', listId);
    if (placeholder) input.placeholder = placeholder;

    const list = document.createElement('div');
    list.setAttribute('role', 'listbox');
    list.id = listId;

    const empty = document.createElement('div');
    setHidden(empty, true);

    const defaultFilter = (value: string, search: string): boolean => {
      return value.toLowerCase().includes(search.toLowerCase());
    };
    const filterFn = customFilter ?? defaultFilter;

    function getVisibleItems(): HTMLDivElement[] {
      return allItems.filter((item) => item.getAttribute('aria-hidden') !== 'true');
    }

    function updateActiveItem(): void {
      const visible = getVisibleItems();
      const activeIdx = state.activeIndex.peek();
      for (const item of allItems) {
        item.setAttribute('aria-selected', 'false');
      }
      if (visible.length > 0 && activeIdx >= 0 && activeIdx < visible.length) {
        visible[activeIdx]?.setAttribute('aria-selected', 'true');
      }
    }

    function runFilter(): void {
      const search = state.inputValue.peek();
      let visibleCount = 0;

      for (const item of allItems) {
        const value = item.getAttribute('data-value') ?? '';
        const text = item.textContent ?? '';
        const keywords = item.getAttribute('data-keywords') ?? '';
        const searchable = `${value} ${text} ${keywords}`;
        const matches = search === '' || filterFn(searchable, search);
        setHidden(item, !matches);
        if (matches) visibleCount++;
      }

      for (const [groupEl, group] of groups) {
        const hasVisible = group.items.some((item) => item.getAttribute('aria-hidden') !== 'true');
        setHidden(group.heading, !hasVisible);
        if (!hasVisible) {
          groupEl.style.display = 'none';
        } else {
          groupEl.style.display = '';
        }
      }

      setHidden(empty, visibleCount > 0);

      state.activeIndex.value = 0;
      updateActiveItem();
    }

    input.addEventListener('input', () => {
      state.inputValue.value = input.value;
      onInputChange?.(input.value);
      runFilter();
    });

    input.addEventListener('keydown', (event) => {
      const visible = getVisibleItems();

      if (isKey(event, Keys.ArrowDown)) {
        event.preventDefault();
        const next = Math.min(state.activeIndex.peek() + 1, visible.length - 1);
        state.activeIndex.value = next;
        updateActiveItem();
        return;
      }

      if (isKey(event, Keys.ArrowUp)) {
        event.preventDefault();
        const prev = Math.max(state.activeIndex.peek() - 1, 0);
        state.activeIndex.value = prev;
        updateActiveItem();
        return;
      }

      if (isKey(event, Keys.Enter)) {
        event.preventDefault();
        const active = visible[state.activeIndex.peek()];
        if (active) {
          const val = active.getAttribute('data-value');
          if (val !== null) {
            onSelect?.(val);
          }
        }
        return;
      }

      if (isKey(event, Keys.Escape)) {
        event.preventDefault();
        input.value = '';
        state.inputValue.value = '';
        onInputChange?.('');
        runFilter();
      }
    });

    function createItem(
      value: string,
      label?: string,
      keywords?: string[],
      parent?: HTMLElement,
    ): HTMLDivElement {
      const item = document.createElement('div');
      item.setAttribute('role', 'option');
      item.setAttribute('data-value', value);
      item.setAttribute('aria-selected', 'false');
      item.textContent = label ?? value;
      if (keywords && keywords.length > 0) {
        item.setAttribute('data-keywords', keywords.join(' '));
      }

      item.addEventListener('click', () => {
        onSelect?.(value);
      });

      allItems.push(item);
      (parent ?? list).appendChild(item);
      updateActiveItem();
      return item;
    }

    function Item(value: string, label?: string, keywords?: string[]): HTMLDivElement {
      return createItem(value, label, keywords);
    }

    function Group(label: string): {
      el: HTMLDivElement;
      Item: (value: string, label?: string, keywords?: string[]) => HTMLDivElement;
    } {
      const headingId = uniqueId('command-group');
      const el = document.createElement('div');
      el.setAttribute('role', 'group');
      el.setAttribute('aria-labelledby', headingId);

      const heading = document.createElement('div');
      heading.id = headingId;
      heading.textContent = label;
      el.appendChild(heading);

      const groupItems: HTMLDivElement[] = [];
      groups.set(el, { heading, items: groupItems });

      list.appendChild(el);

      return {
        el,
        Item: (value: string, itemLabel?: string, keywords?: string[]) => {
          const item = createItem(value, itemLabel, keywords, el);
          groupItems.push(item);
          return item;
        },
      };
    }

    function Separator(): HTMLHRElement {
      const hr = document.createElement('hr');
      hr.setAttribute('role', 'separator');
      list.appendChild(hr);
      return hr;
    }

    root.appendChild(input);
    root.appendChild(list);
    root.appendChild(empty);

    return { root, input, list, empty, state, Item, Group, Separator };
  },
};
