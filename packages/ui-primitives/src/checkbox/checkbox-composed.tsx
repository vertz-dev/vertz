/**
 * Composed Checkbox — high-level composable component built on Checkbox.Root.
 * Applies classes to root button and indicator child.
 */

import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import type { CheckedState } from './checkbox';
import { Checkbox } from './checkbox';

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
// Root composed component
// ---------------------------------------------------------------------------

function ComposedCheckboxRoot({
  children,
  classes,
  defaultChecked,
  disabled,
  onCheckedChange,
}: ComposedCheckboxProps) {
  const root = Checkbox.Root({
    defaultChecked,
    disabled,
    onCheckedChange: (checked) => {
      indicator.setAttribute('data-state', dataStateFor(checked));
      onCheckedChange?.(checked);
    },
  });

  if (classes?.root) root.className = classes.root;

  // Create indicator with JSX
  const initialState = root.getAttribute('data-state') ?? 'unchecked';
  const indicator = (
    <span data-part="indicator" data-state={initialState} class={classes?.indicator} />
  ) as HTMLSpanElement;
  root.appendChild(indicator);

  // Append children (e.g., label text)
  if (children) {
    for (const node of resolveChildren(children)) {
      root.appendChild(node);
    }
  }

  return root;
}

function dataStateFor(checked: CheckedState): string {
  if (checked === 'mixed') return 'indeterminate';
  return checked ? 'checked' : 'unchecked';
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedCheckbox = ComposedCheckboxRoot as ((
  props: ComposedCheckboxProps,
) => HTMLElement) & {
  __classKeys?: CheckboxClassKey;
};
