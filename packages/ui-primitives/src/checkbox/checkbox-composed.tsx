/**
 * Composed Checkbox — declarative JSX component with indicator and class distribution.
 * Builds on the same behavior as Checkbox.Root but in a fully declarative structure.
 */

import type { ChildValue } from '@vertz/ui';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';
import type { CheckedState } from './checkbox';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface CheckboxClasses {
  root?: string;
  indicator?: string;
}

export type CheckboxClassKey = keyof CheckboxClasses;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ComposedCheckboxProps {
  children?: ChildValue;
  classes?: CheckboxClasses;
  defaultChecked?: CheckedState;
  disabled?: boolean;
  onCheckedChange?: (checked: CheckedState) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dataStateFor(checked: CheckedState): string {
  if (checked === 'mixed') return 'indeterminate';
  return checked ? 'checked' : 'unchecked';
}

function ariaCheckedFor(checked: CheckedState): string {
  if (checked === 'mixed') return 'mixed';
  return String(checked);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ComposedCheckboxRoot({
  children,
  classes,
  defaultChecked = false,
  disabled = false,
  onCheckedChange,
}: ComposedCheckboxProps) {
  let checked: CheckedState = defaultChecked;

  function toggle() {
    if (disabled) return;
    checked = checked === 'mixed' ? true : !checked;
    onCheckedChange?.(checked);
  }

  return (
    <button
      type="button"
      role="checkbox"
      id={uniqueId('checkbox')}
      aria-checked={ariaCheckedFor(checked)}
      data-state={dataStateFor(checked)}
      disabled={disabled}
      aria-disabled={disabled ? 'true' : undefined}
      class={classes?.root}
      onClick={toggle}
      onKeydown={(e: KeyboardEvent) => {
        if (isKey(e, Keys.Space)) {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <span
        data-part="indicator"
        data-state={dataStateFor(checked)}
        class={classes?.indicator}
        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
          data-part="indicator-icon"
          data-icon="check"
          width="100%"
          height="100%"
        >
          <path d="M4 12 9 17 20 6" />
        </svg>
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
          data-part="indicator-icon"
          data-icon="minus"
          width="100%"
          height="100%"
        >
          <path d="M5 12h14" />
        </svg>
      </span>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedCheckbox = ComposedCheckboxRoot as ((
  props: ComposedCheckboxProps,
) => HTMLElement) & {
  __classKeys?: CheckboxClassKey;
};
