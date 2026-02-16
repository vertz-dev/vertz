/**
 * Progress primitive - progress indicator with aria-valuenow/min/max.
 * Follows WAI-ARIA progressbar pattern.
 */
import type { Signal } from '@vertz/ui';
export interface ProgressOptions {
  defaultValue?: number;
  min?: number;
  max?: number;
}
export interface ProgressState {
  value: Signal<number>;
}
export interface ProgressElements {
  root: HTMLDivElement;
  indicator: HTMLDivElement;
}
export declare const Progress: {
  Root(options?: ProgressOptions): ProgressElements & {
    state: ProgressState;
    setValue: (value: number) => void;
  };
};
//# sourceMappingURL=progress.d.ts.map
