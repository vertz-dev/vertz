import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setPressed } from '../utils/aria';
import { setRovingTabindex } from '../utils/focus';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

export interface ToggleGroupOptions {
  type?: 'single' | 'multiple';
  defaultValue?: string[];
  orientation?: 'horizontal' | 'vertical';
  disabled?: boolean;
  onValueChange?: (value: string[]) => void;
}

export interface ToggleGroupState {
  value: Signal<string[]>;
  disabled: Signal<boolean>;
}

export interface ToggleGroupElements {
  root: HTMLDivElement;
}

export const ToggleGroup = {
  Root(options: ToggleGroupOptions = {}): ToggleGroupElements & {
    state: ToggleGroupState;
    Item: (value: string) => HTMLButtonElement;
  } {
    const {
      type = 'single',
      defaultValue = [],
      orientation = 'horizontal',
      disabled = false,
      onValueChange,
    } = options;

    const state: ToggleGroupState = {
      value: signal([...defaultValue]),
      disabled: signal(disabled),
    };
    const items: HTMLButtonElement[] = [];

    const root = document.createElement('div');
    root.setAttribute('role', 'group');
    root.setAttribute('data-orientation', orientation);

    function toggleValue(itemValue: string): void {
      if (state.disabled.peek()) return;
      const current = [...state.value.peek()];
      const idx = current.indexOf(itemValue);

      if (type === 'single') {
        if (idx >= 0) {
          current.length = 0;
        } else {
          current.length = 0;
          current.push(itemValue);
        }
      } else {
        if (idx >= 0) {
          current.splice(idx, 1);
        } else {
          current.push(itemValue);
        }
      }

      state.value.value = current;
      onValueChange?.(current);

      for (const item of items) {
        const val = item.getAttribute('data-value') ?? '';
        const isOn = current.includes(val);
        setPressed(item, isOn);
        setDataState(item, isOn ? 'on' : 'off');
      }
    }

    root.addEventListener('keydown', (event) => {
      if (
        isKey(
          event,
          Keys.ArrowLeft,
          Keys.ArrowRight,
          Keys.ArrowUp,
          Keys.ArrowDown,
          Keys.Home,
          Keys.End,
        )
      ) {
        const result = handleListNavigation(event, items, { orientation });
        if (result) {
          const idx = items.indexOf(result as HTMLButtonElement);
          if (idx >= 0) {
            setRovingTabindex(items, idx);
          }
        }
      }
    });

    function Item(value: string): HTMLButtonElement {
      const item = document.createElement('button');
      item.setAttribute('type', 'button');
      item.setAttribute('data-value', value);
      const isOn = state.value.peek().includes(value);
      setPressed(item, isOn);
      setDataState(item, isOn ? 'on' : 'off');

      if (state.disabled.peek()) {
        item.disabled = true;
        item.setAttribute('aria-disabled', 'true');
      }

      item.addEventListener('click', () => toggleValue(value));

      items.push(item);
      setRovingTabindex(items, 0);
      root.appendChild(item);
      return item;
    }

    return { root, state, Item };
  },
};
