/**
 * Composed Toggle — declarative JSX component with class distribution.
 * Builds on the same behavior as Toggle.Root but in a fully declarative structure.
 */

import type { ChildValue } from '@vertz/ui';
import { cn } from '../composed/cn';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface ToggleClasses {
  root?: string;
}

export type ToggleClassKey = keyof ToggleClasses;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ComposedToggleProps {
  children?: ChildValue;
  classes?: ToggleClasses;
  defaultPressed?: boolean;
  disabled?: boolean;
  onPressedChange?: (pressed: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ComposedToggleRoot({
  children,
  classes,
  defaultPressed = false,
  disabled = false,
  onPressedChange,
}: ComposedToggleProps) {
  let pressed = defaultPressed;

  function toggle() {
    if (disabled) return;
    pressed = !pressed;
    onPressedChange?.(pressed);
  }

  return (
    <button
      type="button"
      id={uniqueId('toggle')}
      aria-pressed={pressed ? 'true' : 'false'}
      data-state={pressed ? 'on' : 'off'}
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
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedToggle = ComposedToggleRoot as ((
  props: ComposedToggleProps,
) => HTMLElement) & {
  __classKeys?: ToggleClassKey;
};
