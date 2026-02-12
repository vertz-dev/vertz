/**
 * Radio primitive - RadioGroup + RadioItem with arrow key navigation.
 * Follows WAI-ARIA radio group pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setChecked, setDataState } from '../utils/aria';
import { setRovingTabindex } from '../utils/focus';
import { uniqueId } from '../utils/id';
import { handleListNavigation } from '../utils/keyboard';

export interface RadioOptions {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

export interface RadioState {
  value: Signal<string>;
}

export interface RadioElements {
  root: HTMLDivElement;
}

export const Radio = {
  Root(options: RadioOptions = {}): RadioElements & {
    state: RadioState;
    Item: (value: string, label?: string) => HTMLDivElement;
  } {
    const { defaultValue = '', onValueChange } = options;
    const state: RadioState = { value: signal(defaultValue) };
    const items: HTMLDivElement[] = [];
    const itemValues: string[] = [];

    const root = document.createElement('div');
    root.setAttribute('role', 'radiogroup');
    root.id = uniqueId('radiogroup');

    function selectItem(value: string): void {
      state.value.value = value;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item) continue;
        const isActive = itemValues[i] === value;
        setChecked(item, isActive);
        setDataState(item, isActive ? 'checked' : 'unchecked');
      }
      setRovingTabindex(items, itemValues.indexOf(value));
      onValueChange?.(value);
    }

    root.addEventListener('keydown', (event) => {
      const result = handleListNavigation(event, items, { orientation: 'vertical' });
      if (result) {
        const idx = items.indexOf(result as HTMLDivElement);
        if (idx >= 0) {
          const val = itemValues[idx];
          if (val !== undefined) selectItem(val);
        }
      }
    });

    function Item(value: string, label?: string): HTMLDivElement {
      const item = document.createElement('div');
      item.setAttribute('role', 'radio');
      item.id = uniqueId('radio');
      item.setAttribute('data-value', value);
      item.textContent = label ?? value;
      const isActive = value === state.value.peek();
      setChecked(item, isActive);
      setDataState(item, isActive ? 'checked' : 'unchecked');

      item.addEventListener('click', () => {
        selectItem(value);
        item.focus();
      });

      items.push(item);
      itemValues.push(value);
      root.appendChild(item);

      // Update roving tabindex
      setRovingTabindex(items, itemValues.indexOf(state.value.peek()));

      return item;
    }

    return { root, state, Item };
  },
};
