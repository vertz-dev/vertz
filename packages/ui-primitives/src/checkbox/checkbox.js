/**
 * Checkbox primitive - checkbox with indeterminate state support.
 * Follows WAI-ARIA checkbox pattern, Space to toggle.
 */
import { signal } from '@vertz/ui';
import { setChecked, setDataState } from '../utils/aria';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

function dataStateFor(checked) {
  if (checked === 'mixed') return 'indeterminate';
  return checked ? 'checked' : 'unchecked';
}
export const Checkbox = {
  Root(options = {}) {
    const { defaultChecked = false, disabled = false, onCheckedChange } = options;
    const state = {
      checked: signal(defaultChecked),
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
    function toggle() {
      if (state.disabled.peek()) return;
      const current = state.checked.peek();
      // mixed -> true, true -> false, false -> true
      const next = current === 'mixed' ? true : !current;
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
//# sourceMappingURL=checkbox.js.map
