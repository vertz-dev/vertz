/**
 * Button primitive - accessible button with keyboard activation.
 * Supports role="button" with Enter/Space activation.
 */
import { signal } from '@vertz/ui';
import { setDataState, setDisabled } from '../utils/aria';
import { handleActivation } from '../utils/keyboard';

function createButtonRoot(state, options) {
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
  Root(options = {}) {
    const state = {
      disabled: signal(options.disabled ?? false),
      pressed: signal(false),
    };
    const root = createButtonRoot(state, options);
    return { root, state };
  },
};
//# sourceMappingURL=button.js.map
