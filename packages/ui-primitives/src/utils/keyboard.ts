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
} as const;

export type KeyName = (typeof Keys)[keyof typeof Keys];

/**
 * Check if a keyboard event matches one of the given keys.
 */
export function isKey(event: KeyboardEvent, ...keys: string[]): boolean {
  return keys.includes(event.key);
}

/**
 * Handle arrow key navigation within a list of elements.
 * Supports ArrowUp/Down for vertical lists, ArrowLeft/Right for horizontal.
 * Also supports Home/End for jumping to first/last.
 */
export function handleListNavigation(
  event: KeyboardEvent,
  items: HTMLElement[],
  options: {
    orientation?: 'vertical' | 'horizontal';
    loop?: boolean;
  } = {},
): HTMLElement | null {
  const { orientation = 'vertical', loop = true } = options;

  if (items.length === 0) return null;

  const prevKey = orientation === 'vertical' ? Keys.ArrowUp : Keys.ArrowLeft;
  const nextKey = orientation === 'vertical' ? Keys.ArrowDown : Keys.ArrowRight;

  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  let nextIndex = -1;

  if (isKey(event, prevKey)) {
    event.preventDefault();
    nextIndex = findEnabled(items, currentIndex, -1, loop);
  } else if (isKey(event, nextKey)) {
    event.preventDefault();
    nextIndex = findEnabled(items, currentIndex, 1, loop);
  } else if (isKey(event, Keys.Home)) {
    event.preventDefault();
    nextIndex = findEnabledFrom(items, 0, 1);
  } else if (isKey(event, Keys.End)) {
    event.preventDefault();
    nextIndex = findEnabledFrom(items, items.length - 1, -1);
  }

  const target = items[nextIndex];
  if (target) {
    target.focus();
    return target;
  }

  return null;
}

function isDisabled(el: HTMLElement): boolean {
  return el.getAttribute('aria-disabled') === 'true';
}

function findEnabled(
  items: HTMLElement[],
  current: number,
  direction: 1 | -1,
  loop: boolean,
): number {
  const len = items.length;
  let candidate = current;
  for (let i = 0; i < len; i++) {
    candidate += direction;
    if (loop) {
      candidate = ((candidate % len) + len) % len;
    } else if (candidate < 0 || candidate >= len) {
      return -1;
    }
    const el = items[candidate];
    if (el && !isDisabled(el)) return candidate;
  }
  return -1;
}

function findEnabledFrom(items: HTMLElement[], start: number, direction: 1 | -1): number {
  const len = items.length;
  let candidate = start;
  for (let i = 0; i < len; i++) {
    if (candidate < 0 || candidate >= len) return -1;
    const el = items[candidate];
    if (el && !isDisabled(el)) return candidate;
    candidate += direction;
  }
  return -1;
}

/**
 * Handle activation keys (Enter and Space).
 * Calls the handler and prevents default behavior.
 */
export function handleActivation(event: KeyboardEvent, handler: () => void): void {
  if (isKey(event, Keys.Enter, Keys.Space)) {
    event.preventDefault();
    handler();
  }
}
