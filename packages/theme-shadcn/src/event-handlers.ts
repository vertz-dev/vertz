/**
 * Typed event handler props for interactive themed components.
 *
 * Shared across Button, AlertDialog.Action, AlertDialog.Cancel, etc.
 * Only explicitly listed events are accepted — no arbitrary `on*` string matching.
 */
export interface ElementEventHandlers {
  onClick?: (event: MouseEvent) => void;
  onDblClick?: (event: MouseEvent) => void;
  onMouseDown?: (event: MouseEvent) => void;
  onMouseUp?: (event: MouseEvent) => void;
  onMouseEnter?: (event: MouseEvent) => void;
  onMouseLeave?: (event: MouseEvent) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onKeyUp?: (event: KeyboardEvent) => void;
  onPointerDown?: (event: PointerEvent) => void;
  onPointerUp?: (event: PointerEvent) => void;
}

/**
 * The set of known event handler prop names.
 * Only these keys are wired as event listeners — anything else is ignored.
 */
const EVENT_HANDLER_KEYS: ReadonlySet<string> = new Set<keyof ElementEventHandlers>([
  'onClick',
  'onDblClick',
  'onMouseDown',
  'onMouseUp',
  'onMouseEnter',
  'onMouseLeave',
  'onFocus',
  'onBlur',
  'onKeyDown',
  'onKeyUp',
  'onPointerDown',
  'onPointerUp',
]);

/**
 * Wire typed event handler props onto a DOM element.
 *
 * Only handlers from the known {@link EVENT_HANDLER_KEYS} set are wired.
 * Converts camelCase prop names to lowercase DOM event names
 * (e.g. `onClick` → `click`, `onKeyDown` → `keydown`).
 */
/**
 * Check if a prop key is a known event handler.
 * Used by components that need to separate event handlers from HTML attributes.
 */
export function isKnownEventHandler(key: string): boolean {
  return EVENT_HANDLER_KEYS.has(key);
}

export function wireEventHandlers(el: HTMLElement, handlers: ElementEventHandlers): void {
  for (const [key, value] of Object.entries(handlers)) {
    if (!value || !EVENT_HANDLER_KEYS.has(key)) continue;
    const event = key.slice(2).toLowerCase();
    el.addEventListener(event, value as EventListener);
  }
}
