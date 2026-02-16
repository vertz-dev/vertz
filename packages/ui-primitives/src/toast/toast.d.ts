/**
 * Toast primitive - live region announcements with aria-live.
 * Uses aria-live="polite" for non-intrusive announcements.
 */
import type { Signal } from '@vertz/ui';
export interface ToastOptions {
  duration?: number;
  politeness?: 'polite' | 'assertive';
}
export interface ToastMessage {
  id: string;
  content: string;
  el: HTMLDivElement;
}
export interface ToastState {
  messages: Signal<ToastMessage[]>;
}
export interface ToastElements {
  region: HTMLDivElement;
}
export declare const Toast: {
  Root(options?: ToastOptions): ToastElements & {
    state: ToastState;
    announce: (content: string) => ToastMessage;
    dismiss: (id: string) => void;
  };
};
//# sourceMappingURL=toast.d.ts.map
