/**
 * Switch primitive - toggle switch with aria-checked.
 * Follows WAI-ARIA switch pattern, Space to toggle.
 */

import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export interface SwitchOptions extends ElementAttrs {
  defaultChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

function SwitchRoot(options: SwitchOptions = {}) {
  const { defaultChecked = false, disabled = false, onCheckedChange, ...attrs } = options;

  let checked = defaultChecked;

  function toggle() {
    if (disabled) return;
    checked = !checked;
    onCheckedChange?.(checked);
  }

  const el = (
    <button
      type="button"
      role="switch"
      id={uniqueId('switch')}
      aria-checked={checked ? 'true' : 'false'}
      data-state={checked ? 'checked' : 'unchecked'}
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

export const Switch: { Root: (options?: SwitchOptions) => HTMLButtonElement } = {
  Root: SwitchRoot,
};
