import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import type { DialogOptions } from '@vertz/ui-primitives';
import { Dialog } from '@vertz/ui-primitives';

export type SheetSide = 'left' | 'right' | 'top' | 'bottom';

interface SheetStyleClasses {
  readonly overlay: string;
  readonly panelLeft: string;
  readonly panelRight: string;
  readonly panelTop: string;
  readonly panelBottom: string;
  readonly title: string;
  readonly description: string;
  readonly close: string;
}

const PANEL_CLASS_MAP: Record<SheetSide, keyof SheetStyleClasses> = {
  left: 'panelLeft',
  right: 'panelRight',
  top: 'panelTop',
  bottom: 'panelBottom',
};

// ── Props ──────────────────────────────────────────────────

export interface SheetRootProps extends DialogOptions {
  side?: SheetSide;
  children?: ChildValue;
}

/** @deprecated Use SheetRootProps instead. Kept for backward compatibility. */
export type ThemedSheetOptions = SheetRootProps;

export interface SheetSlotProps {
  children?: ChildValue;
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedSheetComponent {
  (props: SheetRootProps): HTMLElement;
  Trigger: (props: SheetSlotProps) => HTMLElement;
  Content: (props: SheetSlotProps) => HTMLElement;
  Title: (props: SheetSlotProps) => HTMLHeadingElement;
  Description: (props: SheetSlotProps) => HTMLParagraphElement;
  Close: (props: SheetSlotProps) => HTMLButtonElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedSheet(styles: SheetStyleClasses): ThemedSheetComponent {
  // ── Sub-components (slot markers + styled elements) ──

  function SheetTrigger({ children }: SheetSlotProps): HTMLElement {
    const el = document.createElement('span');
    el.dataset.slot = 'sheet-trigger';
    el.style.display = 'contents';
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function SheetContent({ children }: SheetSlotProps): HTMLElement {
    const el = document.createElement('div');
    el.dataset.slot = 'sheet-content';
    el.style.display = 'contents';
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function SheetTitle({ children, class: className }: SheetSlotProps): HTMLHeadingElement {
    const el = document.createElement('h2');
    el.classList.add(styles.title);
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function SheetDescription({ children, class: className }: SheetSlotProps): HTMLParagraphElement {
    const el = document.createElement('p');
    el.classList.add(styles.description);
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function SheetClose({ children, class: className }: SheetSlotProps): HTMLButtonElement {
    const el = document.createElement('button');
    el.dataset.slot = 'sheet-close';
    el.classList.add(styles.close);
    if (className) el.classList.add(className);
    const childNodes = resolveChildren(children);
    if (childNodes.length > 0) {
      for (const node of childNodes) {
        el.appendChild(node);
      }
    } else {
      el.textContent = '\u00d7';
    }
    return el;
  }

  // ── Root orchestrator ──

  function SheetRoot({ children, side, ...options }: SheetRootProps): HTMLElement {
    const resolvedSide = side ?? 'right';
    const onOpenChangeOrig = options.onOpenChange;

    let userTrigger: HTMLElement | null = null;
    let contentChildren: Node[] = [];

    // Scan children for trigger and content slots
    for (const node of resolveChildren(children)) {
      if (!(node instanceof HTMLElement)) continue;
      const slot = node.dataset.slot;
      if (slot === 'sheet-trigger') {
        userTrigger = (node.firstElementChild as HTMLElement) ?? node;
      } else if (slot === 'sheet-content') {
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
    primitive.content.classList.add(styles[PANEL_CLASS_MAP[resolvedSide]]);
    primitive.close.classList.add(styles.close);
    // Use SVG X icon matching shadcn (Lucide X icon)
    primitive.close.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    primitive.close.setAttribute('aria-label', 'Close');

    // Clear Dialog primitive's centering inline styles so sheet CSS can position properly
    primitive.content.style.top = '';
    primitive.content.style.left = '';
    primitive.content.style.transform = '';

    // Move content children into the primitive's content panel
    for (const node of contentChildren) {
      primitive.content.appendChild(node);
    }

    // Auto-add close button
    primitive.content.appendChild(primitive.close);

    // Portal overlay + content to body
    document.body.appendChild(primitive.overlay);
    document.body.appendChild(primitive.content);

    // Wire user's trigger to control the sheet
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
  SheetRoot.Trigger = SheetTrigger;
  SheetRoot.Content = SheetContent;
  SheetRoot.Title = SheetTitle;
  SheetRoot.Description = SheetDescription;
  SheetRoot.Close = SheetClose;

  return SheetRoot as ThemedSheetComponent;
}
