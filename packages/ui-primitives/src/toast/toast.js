/**
 * Toast primitive - live region announcements with aria-live.
 * Uses aria-live="polite" for non-intrusive announcements.
 */
import { signal } from '@vertz/ui';
import { setDataState } from '../utils/aria';
import { uniqueId } from '../utils/id';
export const Toast = {
  Root(options = {}) {
    const { duration = 5000, politeness = 'polite' } = options;
    const state = { messages: signal([]) };
    const region = document.createElement('div');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', politeness);
    region.setAttribute('aria-atomic', 'false');
    setDataState(region, 'empty');
    function announce(content) {
      const id = uniqueId('toast');
      const el = document.createElement('div');
      el.setAttribute('role', 'status');
      el.setAttribute('data-toast-id', id);
      el.textContent = content;
      setDataState(el, 'open');
      const msg = { id, content, el };
      const messages = [...state.messages.peek(), msg];
      state.messages.value = messages;
      region.appendChild(el);
      setDataState(region, 'active');
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
      return msg;
    }
    function dismiss(id) {
      const messages = state.messages.peek().filter((m) => m.id !== id);
      state.messages.value = messages;
      const el = region.querySelector(`[data-toast-id="${id}"]`);
      if (el) {
        setDataState(el, 'closed');
        el.remove();
      }
      if (messages.length === 0) {
        setDataState(region, 'empty');
      }
    }
    return { region, state, announce, dismiss };
  },
};
//# sourceMappingURL=toast.js.map
