/**
 * Focus management utilities for accessible components.
 * Provides focus trapping, focus restoration, and roving tabindex.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]',
].join(', ');
/**
 * Get all focusable elements within a container.
 */
export function getFocusableElements(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
}
/**
 * Create a focus trap within a container element.
 * When Tab is pressed at the last element, focus wraps to the first.
 * When Shift+Tab is pressed at the first element, focus wraps to the last.
 *
 * Returns a cleanup function to remove the trap.
 */
export function trapFocus(container) {
  function handleKeyDown(event) {
    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements(container);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }
  container.addEventListener('keydown', handleKeyDown);
  return () => {
    container.removeEventListener('keydown', handleKeyDown);
  };
}
/**
 * Focus the first focusable element within a container.
 */
export function focusFirst(container) {
  const focusable = getFocusableElements(container);
  if (focusable.length > 0) {
    focusable[0]?.focus();
  }
}
/**
 * Save the currently focused element and return a function to restore focus.
 */
export function saveFocus() {
  const previously = document.activeElement;
  return () => {
    if (previously && typeof previously.focus === 'function') {
      previously.focus();
    }
  };
}
/**
 * Apply roving tabindex to a set of elements.
 * Only the active item has tabindex="0"; all others have tabindex="-1".
 */
export function setRovingTabindex(items, activeIndex) {
  for (let i = 0; i < items.length; i++) {
    items[i]?.setAttribute('tabindex', i === activeIndex ? '0' : '-1');
  }
}
//# sourceMappingURL=focus.js.map
