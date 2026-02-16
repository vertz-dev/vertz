/**
 * Tooltip primitive - accessible tooltip with delay and aria-describedby.
 * Follows WAI-ARIA tooltip pattern.
 */
import { signal } from '@vertz/ui';
import { setDataState, setDescribedBy, setHidden } from '../utils/aria';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';
export const Tooltip = {
  Root(options = {}) {
    const { delay = 300, onOpenChange } = options;
    const contentId = uniqueId('tooltip');
    const state = { open: signal(false) };
    let showTimeout = null;
    const trigger = document.createElement('span');
    setDescribedBy(trigger, contentId);
    const content = document.createElement('div');
    content.setAttribute('role', 'tooltip');
    content.id = contentId;
    setHidden(content, true);
    setDataState(content, 'closed');
    function show() {
      if (showTimeout !== null) return;
      showTimeout = setTimeout(() => {
        state.open.value = true;
        setHidden(content, false);
        setDataState(content, 'open');
        onOpenChange?.(true);
        showTimeout = null;
      }, delay);
    }
    function hide() {
      if (showTimeout !== null) {
        clearTimeout(showTimeout);
        showTimeout = null;
      }
      state.open.value = false;
      setHidden(content, true);
      setDataState(content, 'closed');
      onOpenChange?.(false);
    }
    trigger.addEventListener('mouseenter', show);
    trigger.addEventListener('mouseleave', hide);
    trigger.addEventListener('focus', show);
    trigger.addEventListener('blur', hide);
    trigger.addEventListener('keydown', (event) => {
      if (isKey(event, Keys.Escape)) {
        hide();
      }
    });
    return { trigger, content, state };
  },
};
//# sourceMappingURL=tooltip.js.map
