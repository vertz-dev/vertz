/**
 * Toggle primitive - toggle button with aria-pressed.
 * Follows WAI-ARIA toggle button pattern.
 */

import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export interface ToggleOptions extends ElementAttrs {
  defaultPressed?: boolean;
  disabled?: boolean;
  onPressedChange?: (pressed: boolean) => void;
}

function ToggleRoot(options: ToggleOptions = {}) {
  const { defaultPressed = false, disabled = false, onPressedChange, ...attrs } = options;

  let pressed = defaultPressed;

  function toggle() {
    if (disabled) return;
    pressed = !pressed;
    onPressedChange?.(pressed);
  }

  const el = (
    <button
      type="button"
      id={uniqueId('toggle')}
      aria-pressed={pressed ? 'true' : 'false'}
      data-state={pressed ? 'on' : 'off'}
      disabled={disabled}
      aria-disabled={disabled ? 'true' : undefined}
      onClick={toggle}
      onKeydown={(e: KeyboardEvent) => {
        if (isKey(e, Keys.Space)) {
          e.preventDefault();
          toggle();
        }
      }}
    />
  ) as HTMLButtonElement;

  applyAttrs(el, attrs);
  return el;
}

export const Toggle: { Root: (options?: ToggleOptions) => HTMLButtonElement } = {
  Root: ToggleRoot,
};
