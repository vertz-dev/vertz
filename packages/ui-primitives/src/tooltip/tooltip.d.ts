/**
 * Tooltip primitive - accessible tooltip with delay and aria-describedby.
 * Follows WAI-ARIA tooltip pattern.
 */
import type { Signal } from '@vertz/ui';
export interface TooltipOptions {
  delay?: number;
  onOpenChange?: (open: boolean) => void;
}
export interface TooltipState {
  open: Signal<boolean>;
}
export interface TooltipElements {
  trigger: HTMLElement;
  content: HTMLDivElement;
}
export declare const Tooltip: {
  Root(options?: TooltipOptions): TooltipElements & {
    state: TooltipState;
  };
};
//# sourceMappingURL=tooltip.d.ts.map
