/**
 * Select primitive - listbox pattern with arrow key navigation.
 * Follows WAI-ARIA listbox pattern.
 */
import type { Signal } from '@vertz/ui';
export interface SelectOptions {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}
export interface SelectState {
  open: Signal<boolean>;
  value: Signal<string>;
  activeIndex: Signal<number>;
}
export interface SelectElements {
  trigger: HTMLButtonElement;
  content: HTMLDivElement;
}
export declare const Select: {
  Root(options?: SelectOptions): SelectElements & {
    state: SelectState;
    Item: (value: string, label?: string) => HTMLDivElement;
  };
};
//# sourceMappingURL=select.d.ts.map
