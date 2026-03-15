/**
 * Composed Slider — high-level composable component built on Slider.Root.
 * Returns an HTMLElement for declarative JSX usage. Users needing imperative
 * state access should use the factory API (Slider.Root) instead.
 */

import type { ChildValue } from '@vertz/ui';
import { Slider } from './slider';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface SliderClasses {
  root?: string;
  track?: string;
  range?: string;
  thumb?: string;
}

export type SliderClassKey = keyof SliderClasses;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ComposedSliderProps {
  children?: ChildValue;
  classes?: SliderClasses;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onValueChange?: (value: number) => void;
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

function ComposedSliderRoot({
  classes,
  defaultValue,
  min,
  max,
  step,
  disabled,
  onValueChange,
}: ComposedSliderProps) {
  const result = Slider.Root({ defaultValue, min, max, step, disabled, onValueChange });

  if (classes?.root) result.root.className = classes.root;
  if (classes?.track) result.track.className = classes.track;
  if (classes?.thumb) result.thumb.className = classes.thumb;

  // Apply range class to the fill element
  const fill = result.track.querySelector('[data-part="fill"]') as HTMLElement | null;
  if (fill && classes?.range) fill.className = classes.range;

  return result.root;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedSlider = ComposedSliderRoot as ((
  props: ComposedSliderProps,
) => HTMLElement) & {
  __classKeys?: SliderClassKey;
};
