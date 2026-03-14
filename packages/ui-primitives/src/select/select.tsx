/**
 * Select primitive - listbox pattern with arrow key navigation.
 * Follows WAI-ARIA listbox pattern.
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
import { createDismiss } from '../utils/dismiss';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition } from '../utils/floating';
import { linkedIds } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

export interface SelectOptions {
  defaultValue?: string;
  placeholder?: string;
  onValueChange?: (value: string) => void;
  positioning?: FloatingOptions;
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

function SelectRoot(options: SelectOptions = {}): SelectElements & {
  state: SelectState;
  Item: (value: string, label?: string) => HTMLDivElement;
  Group: (label: string) => {
    el: HTMLDivElement;
    Item: (value: string, label?: string) => HTMLDivElement;
  };
  Separator: () => HTMLHRElement;
} {
  const { defaultValue = '', placeholder = '', onValueChange, positioning } = options;
  const ids = linkedIds('select');
  const state: SelectState = {
    open: signal(false),
    value: signal(defaultValue),
    activeIndex: signal(-1),
  };
  const items: HTMLDivElement[] = [];
  let floatingCleanup: (() => void) | null = null;
  let dismissCleanup: (() => void) | null = null;

  function updateActiveItem(index: number): void {
    for (let i = 0; i < items.length; i++) {
      items[i]?.setAttribute('tabindex', i === index ? '0' : '-1');
    }
  }

  function selectItem(value: string): void {
    state.value.value = value;
    for (const item of items) {
      const isActive = item.getAttribute('data-value') === value;
      setSelected(item, isActive);
      setDataState(item, isActive ? 'active' : 'inactive');
      if (isActive) {
        triggerText.textContent = item.textContent ?? value;
      }
    }
    onValueChange?.(value);
    close();
  }

  function open(): void {
    state.open.value = true;
    setExpanded(trigger, true);
    setHidden(content, false);
    setDataState(trigger, 'open');
    setDataState(content, 'open');

    if (positioning) {
      const result = createFloatingPosition(trigger, content, positioning);
      floatingCleanup = result.cleanup;
      dismissCleanup = createDismiss({
        onDismiss: close,
        insideElements: [trigger, content],
        escapeKey: false,
      });
    } else {
      const rect = trigger.getBoundingClientRect();
      const side = window.innerHeight - rect.bottom >= rect.top ? 'bottom' : 'top';
      content.setAttribute('data-side', side);
    }

    const selectedIdx = items.findIndex(
      (item) => item.getAttribute('data-value') === state.value.peek(),
    );
    if (selectedIdx >= 0) {
      state.activeIndex.value = selectedIdx;
      updateActiveItem(selectedIdx);
      items[selectedIdx]?.focus();
    } else {
      state.activeIndex.value = -1;
      updateActiveItem(-1);
      content.focus();
    }
  }

  function close(): void {
    state.open.value = false;
    setExpanded(trigger, false);
    setDataState(trigger, 'closed');
    setDataState(content, 'closed');
    setHiddenAnimated(content, true);
    floatingCleanup?.();
    floatingCleanup = null;
    dismissCleanup?.();
    dismissCleanup = null;
    trigger.focus();
  }

  const triggerText = (<span data-part="value">{defaultValue || placeholder}</span>) as HTMLElement;

  const trigger = (
    <button
      type="button"
      role="combobox"
      id={ids.triggerId}
      aria-controls={ids.contentId}
      aria-haspopup="listbox"
      aria-expanded="false"
      data-state="closed"
      onClick={() => {
        if (state.open.peek()) {
          close();
        } else {
          open();
        }
      }}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.ArrowDown, Keys.ArrowUp, Keys.Enter, Keys.Space)) {
          event.preventDefault();
          if (!state.open.peek()) {
            open();
          }
        }
      }}
    >
      {triggerText}
    </button>
  ) as HTMLButtonElement;

  const content = (
    <div
      role="listbox"
      tabindex="-1"
      id={ids.contentId}
      aria-hidden="true"
      data-state="closed"
      style="display: none"
      onKeydown={(event: KeyboardEvent) => {
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

        if (state.activeIndex.peek() === -1) {
          if (isKey(event, Keys.ArrowDown)) {
            event.preventDefault();
            state.activeIndex.value = 0;
            updateActiveItem(0);
            items[0]?.focus();
            return;
          }
          if (isKey(event, Keys.ArrowUp)) {
            event.preventDefault();
            const last = items.length - 1;
            state.activeIndex.value = last;
            updateActiveItem(last);
            items[last]?.focus();
            return;
          }
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
      }}
    />
  ) as HTMLDivElement;

  function createItem(value: string, label?: string, parent?: HTMLElement): HTMLDivElement {
    const isSelectedItem = value === defaultValue;

    const item = (
      <div
        role="option"
        data-value={value}
        tabindex="-1"
        aria-selected={isSelectedItem ? 'true' : 'false'}
        data-state={isSelectedItem ? 'active' : 'inactive'}
        onClick={() => selectItem(value)}
      >
        {label ?? value}
      </div>
    ) as HTMLDivElement;

    if (isSelectedItem) {
      triggerText.textContent = item.textContent ?? value;
    }

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
    const el = (<div role="group" aria-label={label} />) as HTMLDivElement;
    content.appendChild(el);
    return {
      el,
      Item: (value: string, itemLabel?: string) => createItem(value, itemLabel, el),
    };
  }

  function Separator(): HTMLHRElement {
    const hr = (<hr role="separator" />) as HTMLHRElement;
    content.appendChild(hr);
    return hr;
  }

  return { trigger, content, state, Item, Group, Separator };
}

export const Select: {
  Root: (options?: SelectOptions) => SelectElements & {
    state: SelectState;
    Item: (value: string, label?: string) => HTMLDivElement;
    Group: (label: string) => {
      el: HTMLDivElement;
      Item: (value: string, label?: string) => HTMLDivElement;
    };
    Separator: () => HTMLHRElement;
  };
} = {
  Root: SelectRoot,
};
