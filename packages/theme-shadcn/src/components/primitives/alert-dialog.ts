import type { DialogState } from '@vertz/ui-primitives';
import { Dialog } from '@vertz/ui-primitives';

interface AlertDialogStyleClasses {
  readonly overlay: string;
  readonly panel: string;
  readonly title: string;
  readonly footer: string;
  readonly cancel: string;
  readonly action: string;
}

export interface AlertDialogOptions {
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface AlertDialogElements {
  trigger: HTMLButtonElement;
  overlay: HTMLDivElement;
  content: HTMLDivElement;
  title: HTMLHeadingElement;
  description: HTMLParagraphElement;
  footer: HTMLDivElement;
  cancel: HTMLButtonElement;
  action: HTMLButtonElement;
  state: DialogState;
}

export function createThemedAlertDialog(
  styles: AlertDialogStyleClasses,
): (options?: AlertDialogOptions) => AlertDialogElements {
  return function themedAlertDialog(options?: AlertDialogOptions): AlertDialogElements {
    const result = Dialog.Root({
      modal: true,
      defaultOpen: options?.defaultOpen,
      onOpenChange: options?.onOpenChange,
    });

    // Apply theme classes
    result.overlay.classList.add(styles.overlay);
    result.content.classList.add(styles.panel);
    result.title.classList.add(styles.title);

    // Prevent overlay click from closing — replace the overlay element
    // by cloning it without event listeners
    const newOverlay = result.overlay.cloneNode(true) as HTMLDivElement;
    newOverlay.style.pointerEvents = 'none';
    result.overlay.replaceWith(newOverlay);

    // Prevent Escape from closing — intercept before Dialog's handler
    result.content.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') {
          event.stopImmediatePropagation();
          event.preventDefault();
        }
      },
      { capture: true },
    );

    // Create additional elements for AlertDialog
    const description = document.createElement('p');
    description.classList.add(styles.panel); // Will be restyled — just need a valid element

    const footer = document.createElement('div');
    footer.classList.add(styles.footer);

    const cancel = document.createElement('button');
    cancel.setAttribute('type', 'button');
    cancel.classList.add(styles.cancel);
    cancel.addEventListener('click', () => {
      result.state.open.value = false;
      // Sync state with Dialog's close mechanism
      result.close.click();
    });

    const action = document.createElement('button');
    action.setAttribute('type', 'button');
    action.classList.add(styles.action);

    return {
      trigger: result.trigger,
      overlay: newOverlay,
      content: result.content,
      title: result.title,
      description,
      footer,
      cancel,
      action,
      state: result.state,
    };
  };
}
