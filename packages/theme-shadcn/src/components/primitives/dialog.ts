import type { DialogElements, DialogOptions, DialogState } from '@vertz/ui-primitives';
import { Dialog } from '@vertz/ui-primitives';

interface DialogStyleClasses {
  readonly overlay: string;
  readonly panel: string;
  readonly title: string;
  readonly close: string;
}

export function createThemedDialog(
  styles: DialogStyleClasses,
): (options?: DialogOptions) => DialogElements & { state: DialogState } {
  return function themedDialog(options?: DialogOptions) {
    const result = Dialog.Root(options);
    result.overlay.classList.add(styles.overlay);
    result.content.classList.add(styles.panel);
    result.title.classList.add(styles.title);
    result.close.classList.add(styles.close);
    return result;
  };
}
