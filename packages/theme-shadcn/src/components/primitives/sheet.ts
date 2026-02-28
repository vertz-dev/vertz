import type { DialogElements, DialogOptions, DialogState } from '@vertz/ui-primitives';
import { Dialog } from '@vertz/ui-primitives';

export type SheetSide = 'left' | 'right' | 'top' | 'bottom';

export interface ThemedSheetOptions extends DialogOptions {
  side?: SheetSide;
}

interface SheetStyleClasses {
  readonly overlay: string;
  readonly panelLeft: string;
  readonly panelRight: string;
  readonly panelTop: string;
  readonly panelBottom: string;
  readonly title: string;
  readonly close: string;
}

const PANEL_CLASS_MAP: Record<SheetSide, keyof SheetStyleClasses> = {
  left: 'panelLeft',
  right: 'panelRight',
  top: 'panelTop',
  bottom: 'panelBottom',
};

export function createThemedSheet(
  styles: SheetStyleClasses,
): (options?: ThemedSheetOptions) => DialogElements & { state: DialogState } {
  return function themedSheet(options?: ThemedSheetOptions) {
    const side = options?.side ?? 'right';
    const result = Dialog.Root(options);
    result.overlay.classList.add(styles.overlay);
    result.content.classList.add(styles[PANEL_CLASS_MAP[side]]);
    result.title.classList.add(styles.title);
    result.close.classList.add(styles.close);
    return result;
  };
}
