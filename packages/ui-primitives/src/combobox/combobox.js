/**
 * Combobox primitive - autocomplete/typeahead with listbox + input.
 * Follows WAI-ARIA combobox pattern.
 */
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setSelected } from '../utils/aria';
import { linkedIds } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';
export const Combobox = {
  Root(options = {}) {
    const { defaultValue = '', onValueChange, onInputChange } = options;
    const ids = linkedIds('combobox');
    const state = {
      open: signal(false),
      value: signal(defaultValue),
      inputValue: signal(defaultValue),
      activeIndex: signal(-1),
    };
    const optionElements = [];
    const input = document.createElement('input');
    input.setAttribute('type', 'text');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', ids.contentId);
    input.setAttribute('aria-haspopup', 'listbox');
    input.id = ids.triggerId;
    input.value = defaultValue;
    setExpanded(input, false);
    const listbox = document.createElement('div');
    listbox.setAttribute('role', 'listbox');
    listbox.id = ids.contentId;
    setHidden(listbox, true);
    setDataState(listbox, 'closed');
    function open() {
      state.open.value = true;
      setExpanded(input, true);
      setHidden(listbox, false);
      setDataState(listbox, 'open');
    }
    function close() {
      state.open.value = false;
      state.activeIndex.value = -1;
      setExpanded(input, false);
      setHidden(listbox, true);
      setDataState(listbox, 'closed');
      updateActiveDescendant(-1);
    }
    function selectOption(value) {
      state.value.value = value;
      state.inputValue.value = value;
      input.value = value;
      for (const opt of optionElements) {
        const isActive = opt.getAttribute('data-value') === value;
        setSelected(opt, isActive);
        setDataState(opt, isActive ? 'active' : 'inactive');
      }
      onValueChange?.(value);
      close();
      input.focus();
    }
    function updateActiveDescendant(index) {
      const opt = optionElements[index];
      if (index >= 0 && opt) {
        input.setAttribute('aria-activedescendant', opt.id);
        for (let i = 0; i < optionElements.length; i++) {
          const el = optionElements[i];
          if (el) setDataState(el, i === index ? 'active' : 'inactive');
        }
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }
    input.addEventListener('input', () => {
      state.inputValue.value = input.value;
      onInputChange?.(input.value);
      if (!state.open.peek()) open();
    });
    input.addEventListener('focus', () => {
      if (!state.open.peek() && input.value.length > 0) open();
    });
    input.addEventListener('keydown', (event) => {
      if (isKey(event, Keys.Escape)) {
        event.preventDefault();
        close();
        return;
      }
      if (isKey(event, Keys.ArrowDown)) {
        event.preventDefault();
        if (!state.open.peek()) {
          open();
        }
        const next = Math.min(state.activeIndex.peek() + 1, optionElements.length - 1);
        state.activeIndex.value = next;
        updateActiveDescendant(next);
        return;
      }
      if (isKey(event, Keys.ArrowUp)) {
        event.preventDefault();
        const prev = Math.max(state.activeIndex.peek() - 1, 0);
        state.activeIndex.value = prev;
        updateActiveDescendant(prev);
        return;
      }
      if (isKey(event, Keys.Enter)) {
        event.preventDefault();
        const idx = state.activeIndex.peek();
        if (idx >= 0 && idx < optionElements.length) {
          const val = optionElements[idx]?.getAttribute('data-value');
          if (val != null) selectOption(val);
        }
        return;
      }
    });
    function Option(value, label) {
      const opt = document.createElement('div');
      const optId = `${ids.contentId}-opt-${optionElements.length}`;
      opt.setAttribute('role', 'option');
      opt.id = optId;
      opt.setAttribute('data-value', value);
      opt.textContent = label ?? value;
      const isSelected = value === defaultValue;
      setSelected(opt, isSelected);
      setDataState(opt, isSelected ? 'active' : 'inactive');
      opt.addEventListener('click', () => {
        selectOption(value);
      });
      optionElements.push(opt);
      listbox.appendChild(opt);
      return opt;
    }
    return { input, listbox, state, Option };
  },
};
//# sourceMappingURL=combobox.js.map
