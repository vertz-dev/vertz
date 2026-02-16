/**
 * Radio primitive - RadioGroup + RadioItem with arrow key navigation.
 * Follows WAI-ARIA radio group pattern.
 */
import { signal } from '@vertz/ui';
import { setChecked, setDataState } from '../utils/aria';
import { setRovingTabindex } from '../utils/focus';
import { uniqueId } from '../utils/id';
import { handleListNavigation } from '../utils/keyboard';
export const Radio = {
  Root(options = {}) {
    const { defaultValue = '', onValueChange } = options;
    const state = { value: signal(defaultValue) };
    const items = [];
    const itemValues = [];
    const root = document.createElement('div');
    root.setAttribute('role', 'radiogroup');
    root.id = uniqueId('radiogroup');
    function selectItem(value) {
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
    root.addEventListener('keydown', (event) => {
      const result = handleListNavigation(event, items, { orientation: 'vertical' });
      if (result) {
        const idx = items.indexOf(result);
        if (idx >= 0) {
          const val = itemValues[idx];
          if (val !== undefined) selectItem(val);
        }
      }
    });
    function Item(value, label) {
      const item = document.createElement('div');
      item.setAttribute('role', 'radio');
      item.id = uniqueId('radio');
      item.setAttribute('data-value', value);
      item.textContent = label ?? value;
      const isActive = value === state.value.peek();
      setChecked(item, isActive);
      setDataState(item, isActive ? 'checked' : 'unchecked');
      item.addEventListener('click', () => {
        selectItem(value);
        item.focus();
      });
      items.push(item);
      itemValues.push(value);
      root.appendChild(item);
      // Update roving tabindex
      setRovingTabindex(items, itemValues.indexOf(state.value.peek()));
      return item;
    }
    return { root, state, Item };
  },
};
//# sourceMappingURL=radio.js.map
