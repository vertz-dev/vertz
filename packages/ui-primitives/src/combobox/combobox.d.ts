/**
 * Combobox primitive - autocomplete/typeahead with listbox + input.
 * Follows WAI-ARIA combobox pattern.
 */
import type { Signal } from '@vertz/ui';
export interface ComboboxOptions {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onInputChange?: (input: string) => void;
}
export interface ComboboxState {
  open: Signal<boolean>;
  value: Signal<string>;
  inputValue: Signal<string>;
  activeIndex: Signal<number>;
}
export interface ComboboxElements {
  input: HTMLInputElement;
  listbox: HTMLDivElement;
}
export declare const Combobox: {
  Root(options?: ComboboxOptions): ComboboxElements & {
    state: ComboboxState;
    Option: (value: string, label?: string) => HTMLDivElement;
  };
};
//# sourceMappingURL=combobox.d.ts.map
