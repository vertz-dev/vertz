/**
 * ARIA state management helpers.
 * Provides functions for setting and toggling ARIA attributes on DOM elements.
 */

import { onAnimationsComplete } from '@vertz/ui/internals';

/**
 * Generation counter per element to invalidate stale hide callbacks.
 * Each call to setHiddenAnimated increments the generation; when the
 * animation-complete callback fires, it only applies display:none if
 * the generation hasn't changed (i.e., no subsequent open/close occurred).
 */
const hideGeneration = new WeakMap<HTMLElement, number>();

/**
 * Set aria-expanded on an element.
 */
export function setExpanded(el: HTMLElement, expanded: boolean): void {
  el.setAttribute('aria-expanded', String(expanded));
}

/**
 * Toggle aria-expanded on an element. Returns the new value.
 */
export function toggleExpanded(el: HTMLElement): boolean {
  const current = el.getAttribute('aria-expanded') === 'true';
  const next = !current;
  setExpanded(el, next);
  return next;
}

/**
 * Set aria-selected on an element.
 */
export function setSelected(el: HTMLElement, selected: boolean): void {
  el.setAttribute('aria-selected', String(selected));
}

/**
 * Set aria-hidden on an element and toggle visual display.
 *
 * aria-hidden alone only affects assistive technology — it does not visually
 * hide the element. We pair it with style.display so that primitives like
 * Dialog, Tabs, and Tooltip actually disappear when hidden.
 */
export function setHidden(el: HTMLElement, hidden: boolean): void {
  el.setAttribute('aria-hidden', String(hidden));
  el.style.display = hidden ? 'none' : '';
}

/**
 * Hide an element after its CSS exit animations complete.
 * Sets aria-hidden immediately for screen readers, but defers
 * style.display = 'none' until animations finish.
 *
 * For showing (hidden=false), the display is set immediately
 * so enter animations can play.
 */
export function setHiddenAnimated(el: HTMLElement, hidden: boolean): void {
  const gen = (hideGeneration.get(el) ?? 0) + 1;
  hideGeneration.set(el, gen);

  if (!hidden) {
    // Show immediately so enter animation is visible
    el.setAttribute('aria-hidden', 'false');
    el.style.display = '';
    return;
  }

  // Hide: set aria-hidden immediately, defer display:none
  el.setAttribute('aria-hidden', 'true');
  onAnimationsComplete(el, () => {
    // Only hide if no subsequent open/close has occurred
    if (hideGeneration.get(el) === gen) {
      el.style.display = 'none';
    }
  });
}

/**
 * Set aria-checked on an element. Supports boolean and 'mixed' for indeterminate.
 */
export function setChecked(el: HTMLElement, checked: boolean | 'mixed'): void {
  el.setAttribute('aria-checked', String(checked));
}

/**
 * Set aria-disabled on an element.
 */
export function setDisabled(el: HTMLElement, disabled: boolean): void {
  el.setAttribute('aria-disabled', String(disabled));
}

/**
 * Set data-state attribute for CSS styling hooks.
 */
export function setDataState(el: HTMLElement, state: string): void {
  el.setAttribute('data-state', state);
}

/**
 * Link two elements with aria-controls.
 */
export function setControls(trigger: HTMLElement, contentId: string): void {
  trigger.setAttribute('aria-controls', contentId);
}

/**
 * Link an element to its label via aria-labelledby.
 */
export function setLabelledBy(el: HTMLElement, labelId: string): void {
  el.setAttribute('aria-labelledby', labelId);
}

/**
 * Link an element to its description via aria-describedby.
 */
export function setDescribedBy(el: HTMLElement, descriptionId: string): void {
  el.setAttribute('aria-describedby', descriptionId);
}

/**
 * Set aria-valuenow, aria-valuemin, and aria-valuemax for range widgets.
 */
export function setValueRange(el: HTMLElement, now: number, min: number, max: number): void {
  el.setAttribute('aria-valuenow', String(now));
  el.setAttribute('aria-valuemin', String(min));
  el.setAttribute('aria-valuemax', String(max));
}
