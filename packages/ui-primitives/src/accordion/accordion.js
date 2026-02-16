/**
 * Accordion primitive - expandable sections with keyboard navigation.
 * Follows WAI-ARIA accordion pattern.
 */
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden } from '../utils/aria';
import { uniqueId } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';
export const Accordion = {
  Root(options = {}) {
    const { multiple = false, defaultValue = [], onValueChange } = options;
    const state = { value: signal([...defaultValue]) };
    const triggers = [];
    const root = document.createElement('div');
    root.setAttribute('data-orientation', 'vertical');
    function toggleItem(value) {
      const current = [...state.value.peek()];
      const idx = current.indexOf(value);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        if (multiple) {
          current.push(value);
        } else {
          current.length = 0;
          current.push(value);
        }
      }
      state.value.value = current;
      onValueChange?.(current);
    }
    root.addEventListener('keydown', (event) => {
      if (isKey(event, Keys.ArrowUp, Keys.ArrowDown, Keys.Home, Keys.End)) {
        handleListNavigation(event, triggers, { orientation: 'vertical' });
      }
    });
    function Item(value) {
      const baseId = uniqueId('accordion');
      const triggerId = `${baseId}-trigger`;
      const contentId = `${baseId}-content`;
      const isOpen = state.value.peek().includes(value);
      const item = document.createElement('div');
      item.setAttribute('data-value', value);
      const trigger = document.createElement('button');
      trigger.setAttribute('type', 'button');
      trigger.id = triggerId;
      trigger.setAttribute('aria-controls', contentId);
      trigger.setAttribute('data-value', value);
      setExpanded(trigger, isOpen);
      setDataState(trigger, isOpen ? 'open' : 'closed');
      const content = document.createElement('div');
      content.setAttribute('role', 'region');
      content.id = contentId;
      content.setAttribute('aria-labelledby', triggerId);
      setHidden(content, !isOpen);
      setDataState(content, isOpen ? 'open' : 'closed');
      trigger.addEventListener('click', () => {
        toggleItem(value);
        const nowOpen = state.value.peek().includes(value);
        setExpanded(trigger, nowOpen);
        setHidden(content, !nowOpen);
        setDataState(trigger, nowOpen ? 'open' : 'closed');
        setDataState(content, nowOpen ? 'open' : 'closed');
      });
      triggers.push(trigger);
      item.appendChild(trigger);
      item.appendChild(content);
      root.appendChild(item);
      return { item, trigger, content };
    }
    return { root, state, Item };
  },
};
//# sourceMappingURL=accordion.js.map
