/**
 * Keyboard event helpers for WAI-ARIA patterns.
 * Provides key constants and navigation handlers for common patterns.
 */
export const Keys = {
  Enter: 'Enter',
  Space: ' ',
  Escape: 'Escape',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Home: 'Home',
  End: 'End',
  Tab: 'Tab',
};
/**
 * Check if a keyboard event matches one of the given keys.
 */
export function isKey(event, ...keys) {
  return keys.includes(event.key);
}
/**
 * Handle arrow key navigation within a list of elements.
 * Supports ArrowUp/Down for vertical lists, ArrowLeft/Right for horizontal.
 * Also supports Home/End for jumping to first/last.
 */
export function handleListNavigation(event, items, options = {}) {
  const { orientation = 'vertical', loop = true } = options;
  if (items.length === 0) return null;
  const prevKey = orientation === 'vertical' ? Keys.ArrowUp : Keys.ArrowLeft;
  const nextKey = orientation === 'vertical' ? Keys.ArrowDown : Keys.ArrowRight;
  const currentIndex = items.indexOf(document.activeElement);
  let nextIndex = -1;
  if (isKey(event, prevKey)) {
    event.preventDefault();
    if (currentIndex <= 0) {
      nextIndex = loop ? items.length - 1 : 0;
    } else {
      nextIndex = currentIndex - 1;
    }
  } else if (isKey(event, nextKey)) {
    event.preventDefault();
    if (currentIndex >= items.length - 1) {
      nextIndex = loop ? 0 : items.length - 1;
    } else {
      nextIndex = currentIndex + 1;
    }
  } else if (isKey(event, Keys.Home)) {
    event.preventDefault();
    nextIndex = 0;
  } else if (isKey(event, Keys.End)) {
    event.preventDefault();
    nextIndex = items.length - 1;
  }
  const target = items[nextIndex];
  if (target) {
    target.focus();
    return target;
  }
  return null;
}
/**
 * Handle activation keys (Enter and Space).
 * Calls the handler and prevents default behavior.
 */
export function handleActivation(event, handler) {
  if (isKey(event, Keys.Enter, Keys.Space)) {
    event.preventDefault();
    handler();
  }
}
//# sourceMappingURL=keyboard.js.map
