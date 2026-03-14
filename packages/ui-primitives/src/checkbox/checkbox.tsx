/**
 * Checkbox primitive - checkbox with indeterminate state support.
 * Follows WAI-ARIA checkbox pattern, Space to toggle.
 */

import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export type CheckedState = boolean | 'mixed';

export interface CheckboxOptions extends ElementAttrs {
  defaultChecked?: CheckedState;
  disabled?: boolean;
  onCheckedChange?: (checked: CheckedState) => void;
}

function dataStateFor(checked: CheckedState): string {
  if (checked === 'mixed') return 'indeterminate';
  return checked ? 'checked' : 'unchecked';
}

function ariaCheckedFor(checked: CheckedState): string {
  if (checked === 'mixed') return 'mixed';
  return String(checked);
}

function CheckboxRoot(options: CheckboxOptions = {}) {
  const { defaultChecked = false, disabled = false, onCheckedChange, ...attrs } = options;

  let checked: CheckedState = defaultChecked;

  function toggle() {
    if (disabled) return;
    // mixed -> true, true -> false, false -> true
    checked = checked === 'mixed' ? true : !checked;
    onCheckedChange?.(checked);
  }

  const el = (
    <button
      type="button"
      role="checkbox"
      id={uniqueId('checkbox')}
      aria-checked={ariaCheckedFor(checked)}
      data-state={dataStateFor(checked)}
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

export const Checkbox: { Root: (options?: CheckboxOptions) => HTMLButtonElement } = {
  Root: CheckboxRoot,
};
