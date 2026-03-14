/**
 * Composed Dialog — high-level composable component built on top of Dialog.Root.
 * Handles slot scanning, trigger wiring, ARIA, portal, and class distribution.
 * Themes use withStyles() to pre-bind CSS classes.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { scanSlots } from '../composed/scan-slots';
import { Dialog } from './dialog';

// ---------------------------------------------------------------------------
// Class distribution context
// ---------------------------------------------------------------------------

export interface DialogClasses {
  overlay?: string;
  content?: string;
  close?: string;
  header?: string;
  title?: string;
  description?: string;
  footer?: string;
}

const DialogClassesContext = createContext<DialogClasses | undefined>(
  undefined,
  '@vertz/ui-primitives::DialogClassesContext',
);

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface SlotProps {
  children?: ChildValue;
  class?: string;
}

// ---------------------------------------------------------------------------
// Sub-components — structural slot markers
// ---------------------------------------------------------------------------

function DialogTrigger({ children }: SlotProps): HTMLElement {
  const el = document.createElement('span');
  el.dataset.slot = 'dialog-trigger';
  el.style.display = 'contents';
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function DialogContent({ children, class: cls }: SlotProps): HTMLElement {
  const el = document.createElement('div');
  el.dataset.slot = 'dialog-content';
  el.style.display = 'contents';
  if (cls) el.dataset.class = cls;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

// ---------------------------------------------------------------------------
// Sub-components — content elements (read classes from context)
// ---------------------------------------------------------------------------

function DialogTitle({ children, class: cls }: SlotProps): HTMLElement {
  const classes = useContext(DialogClassesContext);
  const el = document.createElement('h2');
  const combined = [classes?.title, cls].filter(Boolean).join(' ');
  if (combined) el.className = combined;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function DialogDescription({ children, class: cls }: SlotProps): HTMLElement {
  const classes = useContext(DialogClassesContext);
  const el = document.createElement('p');
  const combined = [classes?.description, cls].filter(Boolean).join(' ');
  if (combined) el.className = combined;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function DialogHeader({ children, class: cls }: SlotProps): HTMLElement {
  const classes = useContext(DialogClassesContext);
  const el = document.createElement('div');
  const combined = [classes?.header, cls].filter(Boolean).join(' ');
  if (combined) el.className = combined;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function DialogFooter({ children, class: cls }: SlotProps): HTMLElement {
  const classes = useContext(DialogClassesContext);
  const el = document.createElement('div');
  const combined = [classes?.footer, cls].filter(Boolean).join(' ');
  if (combined) el.className = combined;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function DialogClose({ children, class: cls }: SlotProps): HTMLElement {
  const classes = useContext(DialogClassesContext);
  const el = document.createElement('button');
  el.type = 'button';
  el.dataset.slot = 'dialog-close';
  const combined = [classes?.close, cls].filter(Boolean).join(' ');
  if (combined) el.className = combined;
  if (children) {
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
  } else {
    el.setAttribute('aria-label', 'Close');
    // Minimal SVG fallback for close icon
    el.innerHTML =
      '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M11.78 4.28a.75.75 0 0 0-1.06-1.06L7.5 6.44 4.28 3.22a.75.75 0 0 0-1.06 1.06L6.44 7.5 3.22 10.72a.75.75 0 1 0 1.06 1.06L7.5 8.56l3.22 3.22a.75.75 0 0 0 1.06-1.06L8.56 7.5l3.22-3.22Z" fill="currentColor"/></svg>';
  }
  return el;
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedDialogProps {
  children?: ChildValue;
  classes?: DialogClasses;
  onOpenChange?: (open: boolean) => void;
  closeIcon?: HTMLElement;
}

function ComposedDialogRoot({
  children,
  classes,
  onOpenChange,
  closeIcon,
}: ComposedDialogProps): HTMLElement {
  // Wrap element to hold everything
  const wrapper = document.createElement('div');
  wrapper.style.display = 'contents';

  // Provide classes via context, then resolve children inside the scope
  let resolvedNodes: Node[];
  DialogClassesContext.Provider(classes, () => {
    resolvedNodes = resolveChildren(children);
  });

  // Scan for structural slots
  const { slots } = scanSlots(resolvedNodes!);
  const triggerEntry = slots.get('dialog-trigger')?.[0];
  const contentEntry = slots.get('dialog-content')?.[0];

  // Extract user trigger element (needed before Dialog.Root to wrap onOpenChange)
  const userTrigger = triggerEntry
    ? ((triggerEntry.element.firstElementChild as HTMLElement) ?? triggerEntry.element)
    : null;

  // Create the low-level dialog primitive, wrapping onOpenChange to sync trigger ARIA
  const dialog = Dialog.Root({
    onOpenChange: (isOpen) => {
      if (userTrigger) {
        userTrigger.setAttribute('aria-expanded', String(isOpen));
        userTrigger.setAttribute('data-state', isOpen ? 'open' : 'closed');
      }
      onOpenChange?.(isOpen);
    },
  });

  // Apply overlay class
  if (classes?.overlay) {
    dialog.overlay.className = classes.overlay;
  }

  // Apply content class (from classes prop + per-instance class from Content sub-component)
  const contentInstanceClass = contentEntry?.attrs.class;
  const contentClassCombined = [classes?.content, contentInstanceClass].filter(Boolean).join(' ');
  if (contentClassCombined) {
    dialog.content.className = contentClassCombined;
  }

  // Wire the user's trigger: ARIA attributes + click handler
  if (userTrigger) {
    userTrigger.setAttribute('aria-haspopup', 'dialog');
    userTrigger.setAttribute('aria-controls', dialog.content.id);
    userTrigger.setAttribute('aria-expanded', 'false');
    userTrigger.setAttribute('data-state', 'closed');

    userTrigger.addEventListener('click', () => {
      if (dialog.state.open.peek()) {
        dialog.hide();
      } else {
        dialog.show();
      }
    });

    wrapper.appendChild(userTrigger);
  }

  // Move content children into the dialog panel
  if (contentEntry) {
    for (const node of contentEntry.children) {
      dialog.content.appendChild(node);
    }
  }

  // Wire close buttons via event delegation (handles nested close buttons)
  dialog.content.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-slot="dialog-close"]');
    if (target) dialog.hide();
  });

  // Add close icon if provided, or use the default close button from the primitive
  if (closeIcon) {
    closeIcon.addEventListener('click', () => dialog.hide());
    dialog.content.appendChild(closeIcon);
  }

  // Portal overlay and content to the wrapper (will be portaled to body in production)
  wrapper.appendChild(dialog.overlay);
  wrapper.appendChild(dialog.content);

  return wrapper;
}

// ---------------------------------------------------------------------------
// Class key type (for withStyles inference)
// ---------------------------------------------------------------------------

export type DialogClassKey = keyof DialogClasses;

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedDialog: ((props: ComposedDialogProps) => HTMLElement) & {
  __classKeys?: DialogClassKey;
  Trigger: typeof DialogTrigger;
  Content: typeof DialogContent;
  Title: typeof DialogTitle;
  Description: typeof DialogDescription;
  Header: typeof DialogHeader;
  Footer: typeof DialogFooter;
  Close: typeof DialogClose;
} = Object.assign(ComposedDialogRoot, {
  Trigger: DialogTrigger,
  Content: DialogContent,
  Title: DialogTitle,
  Description: DialogDescription,
  Header: DialogHeader,
  Footer: DialogFooter,
  Close: DialogClose,
});
