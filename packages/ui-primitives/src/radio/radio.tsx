/**
 * Radio primitive - RadioGroup + RadioItem with arrow key navigation.
 * Follows WAI-ARIA radio group pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setChecked, setDataState, setDisabled } from '../utils/aria';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { setRovingTabindex } from '../utils/focus';
import { uniqueId } from '../utils/id';
import { handleListNavigation } from '../utils/keyboard';

export interface RadioOptions extends ElementAttrs {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

export interface RadioState {
  value: Signal<string>;
}

export interface RadioElements {
  root: HTMLElement;
}

function RadioGroup(
  items: HTMLElement[],
  itemValues: string[],
  selectItem: (value: string) => void,
): HTMLElement {
  return (
    <div
      role="radiogroup"
      id={uniqueId('radiogroup')}
      onKeydown={(event: KeyboardEvent) => {
        const result = handleListNavigation(event, items, { orientation: 'vertical' });
        if (result) {
          const idx = items.indexOf(result);
          if (idx >= 0) {
            const val = itemValues[idx];
            if (val !== undefined) selectItem(val);
          }
        }
      }}
    />
  ) as HTMLElement;
}

export interface RadioItemOptions {
  disabled?: boolean;
}

function RadioItem(
  value: string,
  label: string | undefined,
  isActive: boolean,
  disabled: boolean,
  selectItem: (value: string) => void,
): HTMLElement {
  const el = (
    <div
      role="radio"
      id={uniqueId('radio')}
      data-value={value}
      aria-checked={isActive ? 'true' : 'false'}
      data-state={isActive ? 'checked' : 'unchecked'}
      onClick={() => {
        if (!disabled) selectItem(value);
      }}
    >
      {label ?? value}
    </div>
  ) as HTMLElement;

  if (disabled) {
    setDisabled(el, true);
    el.setAttribute('data-disabled', '');
  }

  return el;
}

function RadioRoot(options: RadioOptions = {}): RadioElements & {
  state: RadioState;
  Item: (value: string, label?: string, itemOptions?: RadioItemOptions) => HTMLElement;
  destroy: () => void;
} {
  const { defaultValue = '', onValueChange, ...attrs } = options;
  const state: RadioState = { value: signal(defaultValue) };
  const items: HTMLElement[] = [];
  const itemValues: string[] = [];

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

  const root = RadioGroup(items, itemValues, selectItem);
  const cleanups: (() => void)[] = [];

  function Item(value: string, label?: string, itemOptions?: RadioItemOptions): HTMLElement {
    const isActive = value === state.value.peek();
    const disabled = itemOptions?.disabled ?? false;

    const item = RadioItem(value, label, isActive, disabled, selectItem);
    const handleClick = () => {
      if (!disabled) item.focus();
    };
    item.addEventListener('click', handleClick);
    cleanups.push(() => item.removeEventListener('click', handleClick));

    items.push(item);
    itemValues.push(value);

    setRovingTabindex(items, itemValues.indexOf(state.value.peek()));

    return item;
  }

  /** Remove manually-added event listeners. JSX-wired handlers are cleaned up by DOM removal. */
  function destroy(): void {
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
  }

  applyAttrs(root, attrs);

  return { root, state, Item, destroy };
}

export const Radio: {
  Root: (options?: RadioOptions) => RadioElements & {
    state: RadioState;
    Item: (value: string, label?: string, itemOptions?: RadioItemOptions) => HTMLElement;
    destroy: () => void;
  };
} = {
  Root: RadioRoot,
};
