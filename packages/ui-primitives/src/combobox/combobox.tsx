/**
 * Combobox primitive - autocomplete/typeahead with listbox + input.
 * Follows WAI-ARIA combobox pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import {
  setDataState,
  setExpanded,
  setHidden,
  setHiddenAnimated,
  setSelected,
} from '../utils/aria';
import { linkedIds } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export interface ComboboxOptions {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onInputChange?: (input: string) => void;
}

export interface ComboboxState {
  open: Signal<boolean>;
  value: Signal<string>;
  inputValue: Signal<string>;
  activeIndex: Signal<number>;
}

export interface ComboboxElements {
  input: HTMLInputElement;
  listbox: HTMLDivElement;
}

function ComboboxRoot(options: ComboboxOptions = {}): ComboboxElements & {
  state: ComboboxState;
  Option: (value: string, label?: string) => HTMLDivElement;
} {
  const { defaultValue = '', onValueChange, onInputChange } = options;
  const ids = linkedIds('combobox');
  const state: ComboboxState = {
    open: signal(false),
    value: signal(defaultValue),
    inputValue: signal(defaultValue),
    activeIndex: signal(-1),
  };
  const optionElements: HTMLDivElement[] = [];

  function open(): void {
    state.open.value = true;
    setExpanded(input, true);
    setHidden(listbox, false);
    setDataState(listbox, 'open');
  }

  function close(): void {
    state.open.value = false;
    state.activeIndex.value = -1;
    setExpanded(input, false);
    setDataState(listbox, 'closed');
    setHiddenAnimated(listbox, true);
    updateActiveDescendant(-1);
  }

  function selectOption(value: string): void {
    state.value.value = value;
    state.inputValue.value = value;
    input.value = value;
    for (const opt of optionElements) {
      const isActive = opt.getAttribute('data-value') === value;
      setSelected(opt, isActive);
      setDataState(opt, isActive ? 'active' : 'inactive');
    }
    onValueChange?.(value);
    close();
    input.focus();
  }

  function updateActiveDescendant(index: number): void {
    const opt = optionElements[index];
    if (index >= 0 && opt) {
      input.setAttribute('aria-activedescendant', opt.id);
      for (let i = 0; i < optionElements.length; i++) {
        const el = optionElements[i];
        if (el) setDataState(el, i === index ? 'active' : 'inactive');
      }
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  const input = (
    <input
      type="text"
      role="combobox"
      aria-autocomplete="list"
      aria-controls={ids.contentId}
      aria-haspopup="listbox"
      id={ids.triggerId}
      value={defaultValue}
      aria-expanded="false"
      onInput={() => {
        state.inputValue.value = input.value;
        onInputChange?.(input.value);
        if (!state.open.peek()) open();
      }}
      onFocus={() => {
        if (!state.open.peek() && input.value.length > 0) open();
      }}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.Escape)) {
          event.preventDefault();
          close();
          return;
        }

        if (isKey(event, Keys.ArrowDown)) {
          event.preventDefault();
          if (!state.open.peek()) {
            open();
          }
          const next = Math.min(state.activeIndex.peek() + 1, optionElements.length - 1);
          state.activeIndex.value = next;
          updateActiveDescendant(next);
          return;
        }

        if (isKey(event, Keys.ArrowUp)) {
          event.preventDefault();
          const prev = Math.max(state.activeIndex.peek() - 1, 0);
          state.activeIndex.value = prev;
          updateActiveDescendant(prev);
          return;
        }

        if (isKey(event, Keys.Enter)) {
          event.preventDefault();
          const idx = state.activeIndex.peek();
          if (idx >= 0 && idx < optionElements.length) {
            const val = optionElements[idx]?.getAttribute('data-value');
            if (val != null) selectOption(val);
          }
          return;
        }
      }}
    />
  ) as HTMLInputElement;

  const listbox = (
    <div
      role="listbox"
      id={ids.contentId}
      aria-hidden="true"
      data-state="closed"
      style="display: none"
    />
  ) as HTMLDivElement;

  function Option(value: string, label?: string): HTMLDivElement {
    const optId = `${ids.contentId}-opt-${optionElements.length}`;
    const isSelectedOpt = value === defaultValue;

    const opt = (
      <div
        role="option"
        id={optId}
        data-value={value}
        aria-selected={isSelectedOpt ? 'true' : 'false'}
        data-state={isSelectedOpt ? 'active' : 'inactive'}
        onClick={() => selectOption(value)}
      >
        {label ?? value}
      </div>
    ) as HTMLDivElement;

    optionElements.push(opt);
    listbox.appendChild(opt);
    return opt;
  }

  return { input, listbox, state, Option };
}

export const Combobox: {
  Root: (options?: ComboboxOptions) => ComboboxElements & {
    state: ComboboxState;
    Option: (value: string, label?: string) => HTMLDivElement;
  };
} = {
  Root: ComboboxRoot,
};
