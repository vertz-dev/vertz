/**
 * Button primitive - accessible button with keyboard activation.
 * Supports role="button" with Enter/Space activation.
 */
import type { Signal } from '@vertz/ui';
export interface ButtonOptions {
  disabled?: boolean;
  onPress?: () => void;
}
export interface ButtonElements {
  root: HTMLButtonElement;
}
export interface ButtonState {
  disabled: Signal<boolean>;
  pressed: Signal<boolean>;
}
export declare const Button: {
  Root(options?: ButtonOptions): ButtonElements & {
    state: ButtonState;
  };
};
//# sourceMappingURL=button.d.ts.map
