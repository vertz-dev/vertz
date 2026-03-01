import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import type { DialogOptions } from '@vertz/ui-primitives';
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

// ── Props ──────────────────────────────────────────────────

export interface AlertDialogRootProps extends DialogOptions {
  children?: ChildValue;
}

export interface AlertDialogSlotProps {
  children?: ChildValue;
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedAlertDialogComponent {
  (props: AlertDialogRootProps): HTMLElement;
  Trigger: (props: AlertDialogSlotProps) => HTMLElement;
  Content: (props: AlertDialogSlotProps) => HTMLElement;
  Title: (props: AlertDialogSlotProps) => HTMLHeadingElement;
  Description: (props: AlertDialogSlotProps) => HTMLParagraphElement;
  Footer: (props: AlertDialogSlotProps) => HTMLDivElement;
  Cancel: (props: AlertDialogSlotProps) => HTMLButtonElement;
  Action: (props: AlertDialogSlotProps) => HTMLButtonElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedAlertDialog(
  styles: AlertDialogStyleClasses,
): ThemedAlertDialogComponent {
  // ── Sub-components (slot markers + styled elements) ──

  function AlertDialogTrigger({ children }: AlertDialogSlotProps): HTMLElement {
    const el = document.createElement('span');
    el.dataset.slot = 'alertdialog-trigger';
    el.style.display = 'contents';
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function AlertDialogContent({ children }: AlertDialogSlotProps): HTMLElement {
    const el = document.createElement('div');
    el.dataset.slot = 'alertdialog-content';
    el.style.display = 'contents';
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function AlertDialogTitle({
    children,
    class: className,
  }: AlertDialogSlotProps): HTMLHeadingElement {
    const el = document.createElement('h2');
    el.classList.add(styles.title);
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function AlertDialogDescription({
    children,
    class: className,
  }: AlertDialogSlotProps): HTMLParagraphElement {
    const el = document.createElement('p');
    el.classList.add(styles.description);
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function AlertDialogFooter({ children, class: className }: AlertDialogSlotProps): HTMLDivElement {
    const el = document.createElement('div');
    el.classList.add(styles.footer);
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function AlertDialogCancel({
    children,
    class: className,
  }: AlertDialogSlotProps): HTMLButtonElement {
    const el = document.createElement('button');
    el.setAttribute('type', 'button');
    el.classList.add(styles.cancel);
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function AlertDialogAction({
    children,
    class: className,
  }: AlertDialogSlotProps): HTMLButtonElement {
    const el = document.createElement('button');
    el.setAttribute('type', 'button');
    el.classList.add(styles.action);
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  // ── Root orchestrator ──

  function AlertDialogRoot({ children, ...options }: AlertDialogRootProps): HTMLElement {
    const onOpenChangeOrig = options.onOpenChange;

    let userTrigger: HTMLElement | null = null;
    let contentChildren: Node[] = [];

    // Scan children for trigger and content slots
    for (const node of resolveChildren(children)) {
      if (!(node instanceof HTMLElement)) continue;
      const slot = node.dataset.slot;
      if (slot === 'alertdialog-trigger') {
        userTrigger = (node.firstElementChild as HTMLElement) ?? node;
      } else if (slot === 'alertdialog-content') {
        contentChildren = Array.from(node.childNodes);
      }
    }

    // Create primitive (handles focus trap, ARIA)
    const primitive = Dialog.Root({
      modal: true,
      ...options,
      onOpenChange: (isOpen) => {
        if (userTrigger) {
          userTrigger.setAttribute('aria-expanded', String(isOpen));
          userTrigger.setAttribute('data-state', isOpen ? 'open' : 'closed');
        }
        onOpenChangeOrig?.(isOpen);
      },
    });

    // Override role for alert dialog semantics
    primitive.content.setAttribute('role', 'alertdialog');

    // Block overlay click — intercept in capture phase before Dialog's handler
    primitive.overlay.addEventListener(
      'click',
      (e) => {
        e.stopImmediatePropagation();
        e.preventDefault();
      },
      { capture: true },
    );

    // Block Escape — intercept before Dialog's handler
    primitive.content.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') {
          e.stopImmediatePropagation();
          e.preventDefault();
        }
      },
      { capture: true },
    );

    // Apply theme classes
    primitive.overlay.classList.add(styles.overlay);
    primitive.content.classList.add(styles.panel);

    // Set up aria-describedby linking
    const descriptionId = `alertdialog-desc-${++idCounter}`;

    // Move content children into the primitive's content panel
    for (const node of contentChildren) {
      primitive.content.appendChild(node);
    }

    // Link description element for aria-describedby
    const descriptionEl = primitive.content.querySelector(`.${styles.description}`);
    if (descriptionEl) {
      descriptionEl.id = descriptionId;
      primitive.content.setAttribute('aria-describedby', descriptionId);
    }

    // Wire Cancel buttons: find elements with cancel style class and add close handler
    const cancelButtons = primitive.content.querySelectorAll(`.${styles.cancel}`);
    for (const btn of cancelButtons) {
      btn.addEventListener('click', () => {
        primitive.hide();
      });
    }

    // Wire Action buttons: find elements with action style class and add close handler
    const actionButtons = primitive.content.querySelectorAll(`.${styles.action}`);
    for (const btn of actionButtons) {
      btn.addEventListener('click', () => {
        primitive.hide();
      });
    }

    // Portal overlay + content to body
    document.body.appendChild(primitive.overlay);
    document.body.appendChild(primitive.content);

    // Wire user's trigger to control the alert dialog
    if (userTrigger) {
      userTrigger.setAttribute('aria-haspopup', 'dialog');
      userTrigger.setAttribute('aria-controls', primitive.content.id);
      userTrigger.setAttribute('aria-expanded', String(options.defaultOpen ?? false));
      userTrigger.setAttribute('data-state', options.defaultOpen ? 'open' : 'closed');
      userTrigger.addEventListener('click', () => {
        if (primitive.state.open.peek()) {
          primitive.hide();
        } else {
          primitive.show();
        }
      });
      return userTrigger;
    }

    return primitive.trigger;
  }

  // Attach sub-components to Root
  AlertDialogRoot.Trigger = AlertDialogTrigger;
  AlertDialogRoot.Content = AlertDialogContent;
  AlertDialogRoot.Title = AlertDialogTitle;
  AlertDialogRoot.Description = AlertDialogDescription;
  AlertDialogRoot.Footer = AlertDialogFooter;
  AlertDialogRoot.Cancel = AlertDialogCancel;
  AlertDialogRoot.Action = AlertDialogAction;

  return AlertDialogRoot as ThemedAlertDialogComponent;
}
