/**
 * @vertz/ui-primitives/utils
 *
 * Low-level utilities for building custom headless components.
 * Most developers should use the pre-built primitives from '@vertz/ui-primitives' instead.
 */

// Animation utilities
export { onAnimationsComplete } from '@vertz/ui/internals';

// ARIA attribute helpers
export {
  setChecked,
  setControls,
  setDataState,
  setDescribedBy,
  setDisabled,
  setExpanded,
  setHidden,
  setHiddenAnimated,
  setLabelledBy,
  setSelected,
  setValueRange,
  toggleExpanded,
} from './utils/aria';
// Attribute forwarding
export type { ElementAttrs } from './utils/attrs';
export { applyAttrs } from './utils/attrs';
// Dismiss (click-outside + Escape)
export type { DismissOptions } from './utils/dismiss';
export { createDismiss } from './utils/dismiss';
// Event handler wiring
export type { ElementEventHandlers } from './utils/event-handlers';
export { isKnownEventHandler, wireEventHandlers } from './utils/event-handlers';
// Floating positioning (wraps @floating-ui/dom)
export type { FloatingOptions, FloatingResult } from './utils/floating';
export { createFloatingPosition, virtualElement } from './utils/floating';
// Focus management
export {
  focusFirst,
  getFocusableElements,
  saveFocus,
  setRovingTabindex,
  trapFocus,
} from './utils/focus';
// ID generation
export { linkedIds, resetIdCounter, uniqueId } from './utils/id';
// Keyboard handling
export { handleActivation, handleListNavigation, isKey, Keys } from './utils/keyboard';

// Combined props (events + attributes)
export { applyProps } from './utils/props';
