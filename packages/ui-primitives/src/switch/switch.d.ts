/**
 * Switch primitive - toggle switch with aria-checked.
 * Follows WAI-ARIA switch pattern, Space to toggle.
 */
import type { Signal } from '@vertz/ui';
export interface SwitchOptions {
  defaultChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}
export interface SwitchState {
  checked: Signal<boolean>;
  disabled: Signal<boolean>;
}
export interface SwitchElements {
  root: HTMLButtonElement;
}
export declare const Switch: {
  Root(options?: SwitchOptions): SwitchElements & {
    state: SwitchState;
  };
};
//# sourceMappingURL=switch.d.ts.map
