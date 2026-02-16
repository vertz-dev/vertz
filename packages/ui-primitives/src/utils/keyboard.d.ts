/**
 * Keyboard event helpers for WAI-ARIA patterns.
 * Provides key constants and navigation handlers for common patterns.
 */
export declare const Keys: {
  readonly Enter: 'Enter';
  readonly Space: ' ';
  readonly Escape: 'Escape';
  readonly ArrowUp: 'ArrowUp';
  readonly ArrowDown: 'ArrowDown';
  readonly ArrowLeft: 'ArrowLeft';
  readonly ArrowRight: 'ArrowRight';
  readonly Home: 'Home';
  readonly End: 'End';
  readonly Tab: 'Tab';
};
export type KeyName = (typeof Keys)[keyof typeof Keys];
/**
 * Check if a keyboard event matches one of the given keys.
 */
export declare function isKey(event: KeyboardEvent, ...keys: string[]): boolean;
/**
 * Handle arrow key navigation within a list of elements.
 * Supports ArrowUp/Down for vertical lists, ArrowLeft/Right for horizontal.
 * Also supports Home/End for jumping to first/last.
 */
export declare function handleListNavigation(
  event: KeyboardEvent,
  items: HTMLElement[],
  options?: {
    orientation?: 'vertical' | 'horizontal';
    loop?: boolean;
  },
): HTMLElement | null;
/**
 * Handle activation keys (Enter and Space).
 * Calls the handler and prevents default behavior.
 */
export declare function handleActivation(event: KeyboardEvent, handler: () => void): void;
//# sourceMappingURL=keyboard.d.ts.map
