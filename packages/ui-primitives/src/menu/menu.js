/**
 * Menu primitive - menubar/menuitem with arrow key navigation.
 * Follows WAI-ARIA menu pattern.
 */
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden } from '../utils/aria';
import { linkedIds } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';
export const Menu = {
  Root(options = {}) {
    const { onSelect } = options;
    const ids = linkedIds('menu');
    const state = {
      open: signal(false),
      activeIndex: signal(-1),
    };
    const items = [];
    const trigger = document.createElement('button');
    trigger.setAttribute('type', 'button');
    trigger.id = ids.triggerId;
    trigger.setAttribute('aria-controls', ids.contentId);
    trigger.setAttribute('aria-haspopup', 'menu');
    setExpanded(trigger, false);
    setDataState(trigger, 'closed');
    const content = document.createElement('div');
    content.setAttribute('role', 'menu');
    content.id = ids.contentId;
    setHidden(content, true);
    setDataState(content, 'closed');
    function open() {
      state.open.value = true;
      setExpanded(trigger, true);
      setHidden(content, false);
      setDataState(trigger, 'open');
      setDataState(content, 'open');
      state.activeIndex.value = 0;
      updateActiveItem(0);
      items[0]?.focus();
    }
    function close() {
      state.open.value = false;
      setExpanded(trigger, false);
      setHidden(content, true);
      setDataState(trigger, 'closed');
      setDataState(content, 'closed');
      trigger.focus();
    }
    function updateActiveItem(index) {
      for (let i = 0; i < items.length; i++) {
        items[i]?.setAttribute('tabindex', i === index ? '0' : '-1');
      }
    }
    trigger.addEventListener('click', () => {
      if (state.open.peek()) {
        close();
      } else {
        open();
      }
    });
    trigger.addEventListener('keydown', (event) => {
      if (isKey(event, Keys.ArrowDown, Keys.Enter, Keys.Space)) {
        event.preventDefault();
        if (!state.open.peek()) open();
      }
    });
    content.addEventListener('keydown', (event) => {
      if (isKey(event, Keys.Escape)) {
        event.preventDefault();
        close();
        return;
      }
      if (isKey(event, Keys.Enter, Keys.Space)) {
        event.preventDefault();
        const active = items[state.activeIndex.peek()];
        if (active) {
          const val = active.getAttribute('data-value');
          if (val !== null) {
            onSelect?.(val);
            close();
          }
        }
        return;
      }
      const result = handleListNavigation(event, items, { orientation: 'vertical' });
      if (result) {
        const idx = items.indexOf(result);
        if (idx >= 0) {
          state.activeIndex.value = idx;
          updateActiveItem(idx);
        }
      }
    });
    function Item(value, label) {
      const item = document.createElement('div');
      item.setAttribute('role', 'menuitem');
      item.setAttribute('data-value', value);
      item.setAttribute('tabindex', '-1');
      item.textContent = label ?? value;
      item.addEventListener('click', () => {
        onSelect?.(value);
        close();
      });
      items.push(item);
      content.appendChild(item);
      return item;
    }
    return { trigger, content, state, Item };
  },
};
//# sourceMappingURL=menu.js.map
