/**
 * Composed Switch — declarative JSX component with thumb and class distribution.
 * Builds on the same behavior as Switch.Root but in a fully declarative structure.
 */

import type { ChildValue } from '@vertz/ui';
import { cn } from '../composed/cn';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface SwitchClasses {
  root?: string;
  thumb?: string;
}

export type SwitchClassKey = keyof SwitchClasses;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ComposedSwitchProps {
  children?: ChildValue;
  classes?: SwitchClasses;
  defaultChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ComposedSwitchRoot({
  classes,
  defaultChecked = false,
  disabled = false,
  onCheckedChange,
}: ComposedSwitchProps) {
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
      class={cn(classes?.root)}
      onClick={toggle}
      onKeydown={(e: KeyboardEvent) => {
        if (isKey(e, Keys.Space)) {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <span
        data-part="thumb"
        data-state={checked ? 'checked' : 'unchecked'}
        class={cn(classes?.thumb)}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedSwitch = ComposedSwitchRoot as ((
  props: ComposedSwitchProps,
) => HTMLElement) & {
  __classKeys?: SwitchClassKey;
};
