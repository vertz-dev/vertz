/**
 * Radio primitive - RadioGroup + RadioItem with arrow key navigation.
 * Follows WAI-ARIA radio group pattern.
 */
import type { Signal } from '@vertz/ui';
export interface RadioOptions {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}
export interface RadioState {
  value: Signal<string>;
}
export interface RadioElements {
  root: HTMLDivElement;
}
export declare const Radio: {
  Root(options?: RadioOptions): RadioElements & {
    state: RadioState;
    Item: (value: string, label?: string) => HTMLDivElement;
  };
};
//# sourceMappingURL=radio.d.ts.map
