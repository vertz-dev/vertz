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

  // Add indicator child
  const indicator = document.createElement('span');
  indicator.setAttribute('data-part', 'indicator');
  const dataState = root.getAttribute('data-state') ?? 'unchecked';
  indicator.setAttribute('data-state', dataState);
  if (classes?.indicator) indicator.className = classes.indicator;
  root.appendChild(indicator);

  // Append children (e.g., label text)
  if (children) {
    const resolved = resolveChildren(children);
    for (const node of resolved) {
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
