/**
 * ARIA state management helpers.
 * Provides functions for setting and toggling ARIA attributes on DOM elements.
 */
/**
 * Set aria-expanded on an element.
 */
export function setExpanded(el, expanded) {
  el.setAttribute('aria-expanded', String(expanded));
}
/**
 * Toggle aria-expanded on an element. Returns the new value.
 */
export function toggleExpanded(el) {
  const current = el.getAttribute('aria-expanded') === 'true';
  const next = !current;
  setExpanded(el, next);
  return next;
}
/**
 * Set aria-selected on an element.
 */
export function setSelected(el, selected) {
  el.setAttribute('aria-selected', String(selected));
}
/**
 * Set aria-hidden on an element and toggle visual display.
 *
 * aria-hidden alone only affects assistive technology — it does not visually
 * hide the element. We pair it with style.display so that primitives like
 * Dialog, Tabs, and Tooltip actually disappear when hidden.
 */
export function setHidden(el, hidden) {
  el.setAttribute('aria-hidden', String(hidden));
  el.style.display = hidden ? 'none' : '';
}
/**
 * Set aria-checked on an element. Supports boolean and 'mixed' for indeterminate.
 */
export function setChecked(el, checked) {
  el.setAttribute('aria-checked', String(checked));
}
/**
 * Set aria-disabled on an element.
 */
export function setDisabled(el, disabled) {
  el.setAttribute('aria-disabled', String(disabled));
}
/**
 * Set data-state attribute for CSS styling hooks.
 */
export function setDataState(el, state) {
  el.setAttribute('data-state', state);
}
/**
 * Link two elements with aria-controls.
 */
export function setControls(trigger, contentId) {
  trigger.setAttribute('aria-controls', contentId);
}
/**
 * Link an element to its label via aria-labelledby.
 */
export function setLabelledBy(el, labelId) {
  el.setAttribute('aria-labelledby', labelId);
}
/**
 * Link an element to its description via aria-describedby.
 */
export function setDescribedBy(el, descriptionId) {
  el.setAttribute('aria-describedby', descriptionId);
}
/**
 * Set aria-valuenow, aria-valuemin, and aria-valuemax for range widgets.
 */
export function setValueRange(el, now, min, max) {
  el.setAttribute('aria-valuenow', String(now));
  el.setAttribute('aria-valuemin', String(min));
  el.setAttribute('aria-valuemax', String(max));
}
//# sourceMappingURL=aria.js.map
