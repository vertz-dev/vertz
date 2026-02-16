/**
 * Dialog primitive - modal/non-modal dialog with focus trap and Escape to close.
 * Follows WAI-ARIA dialog pattern.
 *
 * When modal, provides an overlay element and centers the content via a wrapper.
 * Clicking the overlay closes the dialog.
 */
import type { Signal } from '@vertz/ui';
export interface DialogOptions {
  modal?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}
export interface DialogState {
  open: Signal<boolean>;
}
export interface DialogElements {
  trigger: HTMLButtonElement;
  content: HTMLDivElement;
  overlay: HTMLDivElement;
  title: HTMLHeadingElement;
  close: HTMLButtonElement;
}
export declare const Dialog: {
  Root(options?: DialogOptions): DialogElements & {
    state: DialogState;
  };
};
//# sourceMappingURL=dialog.d.ts.map
