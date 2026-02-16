/**
 * ARIA state management helpers.
 * Provides functions for setting and toggling ARIA attributes on DOM elements.
 */
/**
 * Set aria-expanded on an element.
 */
export declare function setExpanded(el: HTMLElement, expanded: boolean): void;
/**
 * Toggle aria-expanded on an element. Returns the new value.
 */
export declare function toggleExpanded(el: HTMLElement): boolean;
/**
 * Set aria-selected on an element.
 */
export declare function setSelected(el: HTMLElement, selected: boolean): void;
/**
 * Set aria-hidden on an element and toggle visual display.
 *
 * aria-hidden alone only affects assistive technology — it does not visually
 * hide the element. We pair it with style.display so that primitives like
 * Dialog, Tabs, and Tooltip actually disappear when hidden.
 */
export declare function setHidden(el: HTMLElement, hidden: boolean): void;
/**
 * Set aria-checked on an element. Supports boolean and 'mixed' for indeterminate.
 */
export declare function setChecked(el: HTMLElement, checked: boolean | 'mixed'): void;
/**
 * Set aria-disabled on an element.
 */
export declare function setDisabled(el: HTMLElement, disabled: boolean): void;
/**
 * Set data-state attribute for CSS styling hooks.
 */
export declare function setDataState(el: HTMLElement, state: string): void;
/**
 * Link two elements with aria-controls.
 */
export declare function setControls(trigger: HTMLElement, contentId: string): void;
/**
 * Link an element to its label via aria-labelledby.
 */
export declare function setLabelledBy(el: HTMLElement, labelId: string): void;
/**
 * Link an element to its description via aria-describedby.
 */
export declare function setDescribedBy(el: HTMLElement, descriptionId: string): void;
/**
 * Set aria-valuenow, aria-valuemin, and aria-valuemax for range widgets.
 */
export declare function setValueRange(el: HTMLElement, now: number, min: number, max: number): void;
//# sourceMappingURL=aria.d.ts.map
