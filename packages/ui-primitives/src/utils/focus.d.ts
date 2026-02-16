/**
 * Focus management utilities for accessible components.
 * Provides focus trapping, focus restoration, and roving tabindex.
 */
/**
 * Get all focusable elements within a container.
 */
export declare function getFocusableElements(container: HTMLElement): HTMLElement[];
/**
 * Create a focus trap within a container element.
 * When Tab is pressed at the last element, focus wraps to the first.
 * When Shift+Tab is pressed at the first element, focus wraps to the last.
 *
 * Returns a cleanup function to remove the trap.
 */
export declare function trapFocus(container: HTMLElement): () => void;
/**
 * Focus the first focusable element within a container.
 */
export declare function focusFirst(container: HTMLElement): void;
/**
 * Save the currently focused element and return a function to restore focus.
 */
export declare function saveFocus(): () => void;
/**
 * Apply roving tabindex to a set of elements.
 * Only the active item has tabindex="0"; all others have tabindex="-1".
 */
export declare function setRovingTabindex(items: HTMLElement[], activeIndex: number): void;
//# sourceMappingURL=focus.d.ts.map
