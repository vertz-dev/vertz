import type { DialogElements, DialogOptions, DialogState } from '@vertz/ui-primitives';
import { Dialog } from '@vertz/ui-primitives';

export type DrawerSide = 'left' | 'right' | 'top' | 'bottom';

export interface ThemedDrawerOptions extends DialogOptions {
  side?: DrawerSide;
}

interface DrawerStyleClasses {
  readonly overlay: string;
  readonly panelLeft: string;
  readonly panelRight: string;
  readonly panelTop: string;
  readonly panelBottom: string;
  readonly title: string;
  readonly description: string;
  readonly handle: string;
  readonly close: string;
}

const PANEL_CLASS_MAP: Record<DrawerSide, keyof DrawerStyleClasses> = {
  left: 'panelLeft',
  right: 'panelRight',
  top: 'panelTop',
  bottom: 'panelBottom',
};

export function createThemedDrawer(styles: DrawerStyleClasses): (
  options?: ThemedDrawerOptions,
) => DialogElements & {
  state: DialogState;
  handle: HTMLDivElement;
  description: HTMLParagraphElement;
} {
  return function themedDrawer(options?: ThemedDrawerOptions) {
    const side = options?.side ?? 'bottom';
    const result = Dialog.Root(options);

    result.overlay.classList.add(styles.overlay);
    result.content.classList.add(styles[PANEL_CLASS_MAP[side]]);
    result.title.classList.add(styles.title);
    result.close.classList.add(styles.close);

    const handle = document.createElement('div');
    handle.classList.add(styles.handle);
    result.content.insertBefore(handle, result.content.firstChild);

    const description = document.createElement('p');
    description.classList.add(styles.description);
    const descId = `${result.content.id}-description`;
    description.id = descId;
    result.content.setAttribute('aria-describedby', descId);

    return { ...result, handle, description };
  };
}
