/**
 * Button primitive - accessible button with keyboard activation.
 * Supports role="button" with Enter/Space activation.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setDisabled } from '../utils/aria';
import { handleActivation } from '../utils/keyboard';

export interface ButtonOptions {
  disabled?: boolean;
  onPress?: () => void;
}

export interface ButtonElements {
  root: HTMLButtonElement;
}

export interface ButtonState {
  disabled: Signal<boolean>;
  pressed: Signal<boolean>;
}

function createButtonRoot(state: ButtonState, options: ButtonOptions): HTMLButtonElement {
  const el = document.createElement('button');
  el.setAttribute('type', 'button');
  el.setAttribute('role', 'button');
  setDataState(el, 'idle');

  if (options.disabled) {
    el.disabled = true;
    setDisabled(el, true);
  }

  el.addEventListener('click', () => {
    if (state.disabled.peek()) return;
    state.pressed.value = true;
    setDataState(el, 'pressed');
    options.onPress?.();
    // Reset after a tick
    queueMicrotask(() => {
      state.pressed.value = false;
      setDataState(el, 'idle');
    });
  });

  el.addEventListener('keydown', (event) => {
    if (state.disabled.peek()) return;
    handleActivation(event, () => {
      el.click();
    });
  });

  return el;
}

export const Button = {
  Root(options: ButtonOptions = {}): ButtonElements & { state: ButtonState } {
    const state: ButtonState = {
      disabled: signal(options.disabled ?? false),
      pressed: signal(false),
    };

    const root = createButtonRoot(state, options);

    return { root, state };
  },
};
