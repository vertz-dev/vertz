import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setPressed } from '../utils/aria';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { setRovingTabindex } from '../utils/focus';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

export interface ToggleGroupOptions extends ElementAttrs {
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

function ToggleGroupRoot(options: ToggleGroupOptions = {}): ToggleGroupElements & {
  state: ToggleGroupState;
  Item: (value: string) => HTMLButtonElement;
} {
  const {
    type = 'single',
    defaultValue = [],
    orientation = 'horizontal',
    disabled = false,
    onValueChange,
    ...attrs
  } = options;

  const state: ToggleGroupState = {
    value: signal([...defaultValue]),
    disabled: signal(disabled),
  };
  const items: HTMLButtonElement[] = [];

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

  const root = (
    <div
      role="group"
      data-orientation={orientation}
      onKeydown={(event: KeyboardEvent) => {
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
      }}
    />
  ) as HTMLDivElement;

  function Item(value: string): HTMLButtonElement {
    const isOn = state.value.peek().includes(value);

    const item = (
      <button
        type="button"
        data-value={value}
        aria-pressed={isOn ? 'true' : 'false'}
        data-state={isOn ? 'on' : 'off'}
        disabled={state.disabled.peek()}
        aria-disabled={state.disabled.peek() ? 'true' : undefined}
        onClick={() => toggleValue(value)}
      />
    ) as HTMLButtonElement;

    items.push(item);
    setRovingTabindex(items, 0);
    root.appendChild(item);
    return item;
  }

  applyAttrs(root, attrs);

  return { root, state, Item };
}

export const ToggleGroup: {
  Root: (options?: ToggleGroupOptions) => ToggleGroupElements & {
    state: ToggleGroupState;
    Item: (value: string) => HTMLButtonElement;
  };
} = {
  Root: ToggleGroupRoot,
};
