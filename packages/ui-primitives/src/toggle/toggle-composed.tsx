/**
 * Composed Toggle — high-level composable component built on Toggle.Root.
 * Applies root class and moves children into the toggle button.
 */

import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import { Toggle } from './toggle';

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
// Root composed component
// ---------------------------------------------------------------------------

function ComposedToggleRoot({
  children,
  classes,
  defaultPressed,
  disabled,
  onPressedChange,
}: ComposedToggleProps) {
  const root = Toggle.Root({
    defaultPressed,
    disabled,
    onPressedChange,
  });

  if (classes?.root) root.className = classes.root;

  // Move children into the button
  if (children) {
    const resolved = resolveChildren(children);
    for (const node of resolved) {
      root.appendChild(node);
    }
  }

  return root;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedToggle = ComposedToggleRoot as ((
  props: ComposedToggleProps,
) => HTMLElement) & {
  __classKeys?: ToggleClassKey;
};
