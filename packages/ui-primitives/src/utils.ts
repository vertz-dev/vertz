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

// Dismiss (click-outside + Escape)
export type { DismissOptions } from './utils/dismiss';
export { createDismiss } from './utils/dismiss';

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
