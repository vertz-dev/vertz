/**
 * Slider primitive - range slider with arrow key adjustment.
 * Follows WAI-ARIA slider pattern.
 */
import type { Signal } from '@vertz/ui';
export interface SliderOptions {
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onValueChange?: (value: number) => void;
}
export interface SliderState {
  value: Signal<number>;
  disabled: Signal<boolean>;
}
export interface SliderElements {
  root: HTMLDivElement;
  thumb: HTMLDivElement;
  track: HTMLDivElement;
}
export declare const Slider: {
  Root(options?: SliderOptions): SliderElements & {
    state: SliderState;
  };
};
//# sourceMappingURL=slider.d.ts.map
