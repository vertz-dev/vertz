/**
 * Checkbox primitive - checkbox with indeterminate state support.
 * Follows WAI-ARIA checkbox pattern, Space to toggle.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setChecked, setDataState } from '../utils/aria';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export type CheckedState = boolean | 'mixed';

export interface CheckboxOptions {
  defaultChecked?: CheckedState;
  disabled?: boolean;
  onCheckedChange?: (checked: CheckedState) => void;
}

export interface CheckboxState {
  checked: Signal<CheckedState>;
  disabled: Signal<boolean>;
}

export interface CheckboxElements {
  root: HTMLButtonElement;
}

function dataStateFor(checked: CheckedState): string {
  if (checked === 'mixed') return 'indeterminate';
  return checked ? 'checked' : 'unchecked';
}

export const Checkbox = {
  Root(options: CheckboxOptions = {}): CheckboxElements & { state: CheckboxState } {
    const { defaultChecked = false, disabled = false, onCheckedChange } = options;
    const state: CheckboxState = {
      checked: signal<CheckedState>(defaultChecked),
      disabled: signal(disabled),
    };

    const root = document.createElement('button');
    root.setAttribute('type', 'button');
    root.setAttribute('role', 'checkbox');
    root.id = uniqueId('checkbox');
    setChecked(root, defaultChecked);
    setDataState(root, dataStateFor(defaultChecked));

    if (disabled) {
      root.disabled = true;
      root.setAttribute('aria-disabled', 'true');
    }

    function toggle(): void {
      if (state.disabled.peek()) return;
      const current = state.checked.peek();
      // mixed -> true, true -> false, false -> true
      const next: CheckedState = current === 'mixed' ? true : !current;
      state.checked.value = next;
      setChecked(root, next);
      setDataState(root, dataStateFor(next));
      onCheckedChange?.(next);
    }

    root.addEventListener('click', toggle);

    root.addEventListener('keydown', (event) => {
      if (isKey(event, Keys.Space)) {
        event.preventDefault();
        toggle();
      }
    });

    return { root, state };
  },
};
