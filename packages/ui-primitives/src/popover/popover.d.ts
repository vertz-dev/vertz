/**
 * Popover primitive - positioned popover with focus management.
 * Follows WAI-ARIA disclosure pattern.
 */
import type { Signal } from '@vertz/ui';
export interface PopoverOptions {
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}
export interface PopoverState {
  open: Signal<boolean>;
}
export interface PopoverElements {
  trigger: HTMLButtonElement;
  content: HTMLDivElement;
}
export declare const Popover: {
  Root(options?: PopoverOptions): PopoverElements & {
    state: PopoverState;
  };
};
//# sourceMappingURL=popover.d.ts.map
