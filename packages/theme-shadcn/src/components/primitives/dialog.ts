import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import type { DialogOptions } from '@vertz/ui-primitives';
import { Dialog } from '@vertz/ui-primitives';

interface DialogStyleClasses {
  readonly overlay: string;
  readonly panel: string;
  readonly header: string;
  readonly title: string;
  readonly description: string;
  readonly close: string;
  readonly footer: string;
}

// ── Props ──────────────────────────────────────────────────

export interface DialogRootProps extends DialogOptions {
  children?: ChildValue;
}

export interface DialogSlotProps {
  children?: ChildValue;
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedDialogComponent {
  (props: DialogRootProps): HTMLElement;
  Trigger: (props: DialogSlotProps) => HTMLElement;
  Content: (props: DialogSlotProps) => HTMLElement;
  Header: (props: DialogSlotProps) => HTMLDivElement;
  Title: (props: DialogSlotProps) => HTMLHeadingElement;
  Description: (props: DialogSlotProps) => HTMLParagraphElement;
  Footer: (props: DialogSlotProps) => HTMLDivElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedDialog(styles: DialogStyleClasses): ThemedDialogComponent {
  // ── Sub-components (slot markers + styled elements) ──

  function DialogTrigger({ children }: DialogSlotProps): HTMLElement {
    const el = document.createElement('span');
    el.dataset.slot = 'dialog-trigger';
    el.style.display = 'contents';
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function DialogContent({ children }: DialogSlotProps): HTMLElement {
    const el = document.createElement('div');
    el.dataset.slot = 'dialog-content';
    el.style.display = 'contents';
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function DialogHeader({ children, class: className }: DialogSlotProps): HTMLDivElement {
    const el = document.createElement('div');
    el.classList.add(styles.header);
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function DialogTitle({ children, class: className }: DialogSlotProps): HTMLHeadingElement {
    const el = document.createElement('h2');
    el.classList.add(styles.title);
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function DialogDescription({
    children,
    class: className,
  }: DialogSlotProps): HTMLParagraphElement {
    const el = document.createElement('p');
    el.classList.add(styles.description);
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function DialogFooter({ children, class: className }: DialogSlotProps): HTMLDivElement {
    const el = document.createElement('div');
    el.classList.add(styles.footer);
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  // ── Root orchestrator ──

  function DialogRoot({ children, ...options }: DialogRootProps): HTMLElement {
    const onOpenChangeOrig = options.onOpenChange;

    let userTrigger: HTMLElement | null = null;
    let contentChildren: Node[] = [];

    // Scan children for trigger and content slots
    for (const node of resolveChildren(children)) {
      if (!(node instanceof HTMLElement)) continue;
      const slot = node.dataset.slot;
      if (slot === 'dialog-trigger') {
        userTrigger = (node.firstElementChild as HTMLElement) ?? node;
      } else if (slot === 'dialog-content') {
        contentChildren = Array.from(node.childNodes);
      }
    }

    // Create primitive (handles focus trap, escape, overlay click, ARIA)
    const primitive = Dialog.Root({
      ...options,
      onOpenChange: (isOpen) => {
        if (userTrigger) {
          userTrigger.setAttribute('aria-expanded', String(isOpen));
          userTrigger.setAttribute('data-state', isOpen ? 'open' : 'closed');
        }
        onOpenChangeOrig?.(isOpen);
      },
    });

    // Apply theme classes
    primitive.overlay.classList.add(styles.overlay);
    primitive.content.classList.add(styles.panel);
    primitive.close.classList.add(styles.close);
    // Use SVG X icon matching shadcn (Lucide X icon)
    primitive.close.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    primitive.close.setAttribute('aria-label', 'Close');

    // Move content children into the primitive's content panel
    for (const node of contentChildren) {
      primitive.content.appendChild(node);
    }

    // Auto-add close button
    primitive.content.appendChild(primitive.close);

    // Portal overlay + content to body
    document.body.appendChild(primitive.overlay);
    document.body.appendChild(primitive.content);

    // Wire user's trigger to control the dialog
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
  DialogRoot.Trigger = DialogTrigger;
  DialogRoot.Content = DialogContent;
  DialogRoot.Header = DialogHeader;
  DialogRoot.Title = DialogTitle;
  DialogRoot.Description = DialogDescription;
  DialogRoot.Footer = DialogFooter;

  return DialogRoot as ThemedDialogComponent;
}
