/**
 * Toggle primitive - toggle button with aria-pressed.
 * Follows WAI-ARIA toggle button pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setPressed } from '../utils/aria';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export interface ToggleOptions {
  defaultPressed?: boolean;
  disabled?: boolean;
  onPressedChange?: (pressed: boolean) => void;
}

export interface ToggleState {
  pressed: Signal<boolean>;
  disabled: Signal<boolean>;
}

export interface ToggleElements {
  root: HTMLButtonElement;
}

export const Toggle = {
  Root(options: ToggleOptions = {}): ToggleElements & { state: ToggleState } {
    const { defaultPressed = false, disabled = false, onPressedChange } = options;
    const state: ToggleState = {
      pressed: signal(defaultPressed),
      disabled: signal(disabled),
    };

    const root = document.createElement('button');
    root.setAttribute('type', 'button');
    root.id = uniqueId('toggle');
    setPressed(root, defaultPressed);
    setDataState(root, defaultPressed ? 'on' : 'off');

    if (disabled) {
      root.disabled = true;
      root.setAttribute('aria-disabled', 'true');
    }

    function toggle(): void {
      if (state.disabled.peek()) return;
      const next = !state.pressed.peek();
      state.pressed.value = next;
      setPressed(root, next);
      setDataState(root, next ? 'on' : 'off');
      onPressedChange?.(next);
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
