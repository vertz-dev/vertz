/**
 * Switch primitive - toggle switch with aria-checked.
 * Follows WAI-ARIA switch pattern, Space to toggle.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setChecked, setDataState } from '../utils/aria';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export interface SwitchOptions {
  defaultChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export interface SwitchState {
  checked: Signal<boolean>;
  disabled: Signal<boolean>;
}

export interface SwitchElements {
  root: HTMLButtonElement;
}

export const Switch = {
  Root(options: SwitchOptions = {}): SwitchElements & { state: SwitchState } {
    const { defaultChecked = false, disabled = false, onCheckedChange } = options;
    const state: SwitchState = {
      checked: signal(defaultChecked),
      disabled: signal(disabled),
    };

    const root = document.createElement('button');
    root.setAttribute('type', 'button');
    root.setAttribute('role', 'switch');
    root.id = uniqueId('switch');
    setChecked(root, defaultChecked);
    setDataState(root, defaultChecked ? 'checked' : 'unchecked');

    if (disabled) {
      root.disabled = true;
      root.setAttribute('aria-disabled', 'true');
    }

    function toggle(): void {
      if (state.disabled.peek()) return;
      const next = !state.checked.peek();
      state.checked.value = next;
      setChecked(root, next);
      setDataState(root, next ? 'checked' : 'unchecked');
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
