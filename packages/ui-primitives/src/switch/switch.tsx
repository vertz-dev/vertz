/**
 * Switch primitive - toggle switch with aria-checked.
 * Follows WAI-ARIA switch pattern, Space to toggle.
 */

import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export interface SwitchOptions {
  defaultChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

function SwitchRoot(options: SwitchOptions = {}) {
  const { defaultChecked = false, disabled = false, onCheckedChange } = options;

  let checked = defaultChecked;

  function toggle() {
    if (disabled) return;
    checked = !checked;
    onCheckedChange?.(checked);
  }

  return (
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
}

export const Switch: { Root: (options?: SwitchOptions) => HTMLButtonElement } = {
  Root: SwitchRoot,
};
