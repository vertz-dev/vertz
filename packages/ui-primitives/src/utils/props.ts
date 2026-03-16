import { applyAttrs } from './attrs';
import type { ElementEventHandlers } from './event-handlers';
import { isKnownEventHandler, wireEventHandlers } from './event-handlers';

/**
 * Apply a bag of props to a DOM element: wire on* event handlers via addEventListener,
 * then forward remaining keys as HTML attributes (delegating to applyAttrs).
 *
 * Use applyAttrs directly if your props bag contains no event handlers.
 *
 * Designed for imperative .ts theme components. JSX .tsx components compiled by Vertz
 * do not need this — the compiler handles event wiring automatically.
 */
export function applyProps(el: HTMLElement, props: Record<string, unknown>): void {
  wireEventHandlers(el, props as ElementEventHandlers);
  const attrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (isKnownEventHandler(key)) continue;
    attrs[key] = value;
  }
  applyAttrs(el, attrs);
}
