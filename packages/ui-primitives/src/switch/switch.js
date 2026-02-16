/**
 * Switch primitive - toggle switch with aria-checked.
 * Follows WAI-ARIA switch pattern, Space to toggle.
 */
import { signal } from '@vertz/ui';
import { setChecked, setDataState } from '../utils/aria';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';
export const Switch = {
  Root(options = {}) {
    const { defaultChecked = false, disabled = false, onCheckedChange } = options;
    const state = {
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
    function toggle() {
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
//# sourceMappingURL=switch.js.map
