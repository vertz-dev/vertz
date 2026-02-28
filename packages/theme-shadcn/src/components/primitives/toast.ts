import type { ToastElements, ToastMessage, ToastOptions, ToastState } from '@vertz/ui-primitives';
import { Toast } from '@vertz/ui-primitives';

interface ToastStyleClasses {
  readonly viewport: string;
  readonly root: string;
}

export type ThemedToastResult = ToastElements & {
  state: ToastState;
  announce: (content: string) => ToastMessage;
  dismiss: (id: string) => void;
};

export function createThemedToast(
  styles: ToastStyleClasses,
): (options?: ToastOptions) => ThemedToastResult {
  return function themedToast(options?: ToastOptions): ThemedToastResult {
    const result = Toast.Root(options);
    result.region.classList.add(styles.viewport);

    // Wrap announce to apply styles to each toast message element
    const originalAnnounce = result.announce;
    const announce = (content: string): ToastMessage => {
      const msg = originalAnnounce(content);
      msg.el.classList.add(styles.root);
      return msg;
    };

    return { ...result, announce };
  };
}
