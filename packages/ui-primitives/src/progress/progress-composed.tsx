/**
 * Composed Progress — high-level composable component built on Progress.Root.
 * Returns an HTMLElement for declarative JSX usage.
 */

import type { ChildValue } from '@vertz/ui';
import { Progress } from './progress';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface ProgressClasses {
  root?: string;
  indicator?: string;
}

export type ProgressClassKey = keyof ProgressClasses;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ComposedProgressProps {
  children?: ChildValue;
  classes?: ProgressClasses;
  defaultValue?: number;
  min?: number;
  max?: number;
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

function ComposedProgressRoot({ classes, defaultValue, min, max }: ComposedProgressProps) {
  const result = Progress.Root({ defaultValue, min, max });

  if (classes?.root) result.root.className = classes.root;
  if (classes?.indicator) result.indicator.className = classes.indicator;

  return result.root;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedProgress = ComposedProgressRoot as ((
  props: ComposedProgressProps,
) => HTMLElement) & {
  __classKeys?: ProgressClassKey;
};
