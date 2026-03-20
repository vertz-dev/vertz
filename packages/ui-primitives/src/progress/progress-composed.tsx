/**
 * Composed Progress — declarative JSX component with class distribution.
 * Builds on the same behavior as Progress.Root but in a fully declarative structure.
 * Returns HTMLElement (no imperative setValue/state — use Progress.Root for that).
 */

import type { ChildValue } from '@vertz/ui';
import { uniqueId } from '../utils/id';

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
// Helpers
// ---------------------------------------------------------------------------

function dataStateFor(pct: number): string {
  if (pct >= 100) return 'complete';
  if (pct > 0) return 'loading';
  return 'idle';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ComposedProgressRoot({
  classes,
  defaultValue = 0,
  min = 0,
  max = 100,
}: ComposedProgressProps) {
  const pct = ((defaultValue - min) / (max - min)) * 100;

  return (
    <div
      role="progressbar"
      id={uniqueId('progress')}
      aria-valuenow={String(defaultValue)}
      aria-valuemin={String(min)}
      aria-valuemax={String(max)}
      data-state={dataStateFor(pct)}
      class={classes?.root}
    >
      <div data-part="indicator" style={{ width: `${pct}%` }} class={classes?.indicator} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedProgress = ComposedProgressRoot as ((
  props: ComposedProgressProps,
) => HTMLElement) & {
  __classKeys?: ProgressClassKey;
};
