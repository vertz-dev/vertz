/**
 * Checkbox primitive - checkbox with indeterminate state support.
 * Follows WAI-ARIA checkbox pattern, Space to toggle.
 */
import type { Signal } from '@vertz/ui';
export type CheckedState = boolean | 'mixed';
export interface CheckboxOptions {
  defaultChecked?: CheckedState;
  disabled?: boolean;
  onCheckedChange?: (checked: CheckedState) => void;
}
export interface CheckboxState {
  checked: Signal<CheckedState>;
  disabled: Signal<boolean>;
}
export interface CheckboxElements {
  root: HTMLButtonElement;
}
export declare const Checkbox: {
  Root(options?: CheckboxOptions): CheckboxElements & {
    state: CheckboxState;
  };
};
//# sourceMappingURL=checkbox.d.ts.map
