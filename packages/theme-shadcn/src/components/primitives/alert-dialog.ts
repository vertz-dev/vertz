import type { DialogState } from '@vertz/ui-primitives';
import { Dialog } from '@vertz/ui-primitives';

let idCounter = 0;

interface AlertDialogStyleClasses {
  readonly overlay: string;
  readonly panel: string;
  readonly title: string;
  readonly description: string;
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

    // Override role for alert dialog semantics
    result.content.setAttribute('role', 'alertdialog');

    // Apply theme classes
    result.overlay.classList.add(styles.overlay);
    result.content.classList.add(styles.panel);
    result.title.classList.add(styles.title);

    // Prevent overlay click from closing — intercept in capture phase
    // before Dialog's bubbling handler fires
    result.overlay.addEventListener(
      'click',
      (e) => {
        e.stopImmediatePropagation();
        e.preventDefault();
      },
      { capture: true },
    );

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
    const descriptionId = `alertdialog-desc-${++idCounter}`;
    const description = document.createElement('p');
    description.id = descriptionId;
    description.classList.add(styles.description);
    result.content.setAttribute('aria-describedby', descriptionId);

    const footer = document.createElement('div');
    footer.classList.add(styles.footer);

    const cancel = document.createElement('button');
    cancel.setAttribute('type', 'button');
    cancel.classList.add(styles.cancel);
    cancel.addEventListener('click', () => {
      result.close.click();
    });

    const action = document.createElement('button');
    action.setAttribute('type', 'button');
    action.classList.add(styles.action);
    action.addEventListener('click', () => {
      result.close.click();
    });

    return {
      trigger: result.trigger,
      overlay: result.overlay,
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
