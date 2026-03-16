/**
 * Composed Dialog — high-level composable component built on top of Dialog.Root.
 * Handles slot scanning, trigger wiring, ARIA, portal, and class distribution.
 * Themes use withStyles() to pre-bind CSS classes.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
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
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ---------------------------------------------------------------------------
// Sub-components — structural slot markers
// ---------------------------------------------------------------------------

function DialogTrigger({ children }: SlotProps) {
  return (
    <span data-slot="dialog-trigger" style="display: contents">
      {children}
    </span>
  );
}

function DialogContent({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  return (
    <div
      data-slot="dialog-content"
      data-class={effectiveCls || undefined}
      style="display: contents"
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components — content elements (read classes from context)
// ---------------------------------------------------------------------------

function DialogTitle({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  const classes = useContext(DialogClassesContext);
  const combined = [classes?.title, effectiveCls].filter(Boolean).join(' ');
  return (
    <h2 data-slot="dialog-title" class={combined || undefined}>
      {children}
    </h2>
  );
}

function DialogDescription({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  const classes = useContext(DialogClassesContext);
  const combined = [classes?.description, effectiveCls].filter(Boolean).join(' ');
  return (
    <p data-slot="dialog-description" class={combined || undefined}>
      {children}
    </p>
  );
}

function DialogHeader({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  const classes = useContext(DialogClassesContext);
  const combined = [classes?.header, effectiveCls].filter(Boolean).join(' ');
  return <div class={combined || undefined}>{children}</div>;
}

function DialogFooter({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  const classes = useContext(DialogClassesContext);
  const combined = [classes?.footer, effectiveCls].filter(Boolean).join(' ');
  return <div class={combined || undefined}>{children}</div>;
}

function DialogClose({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  const classes = useContext(DialogClassesContext);
  const combined = [classes?.close, effectiveCls].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      data-slot="dialog-close"
      class={combined || undefined}
      aria-label={children ? undefined : 'Close'}
    >
      {children ?? '\u00D7'}
    </button>
  );
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

function ComposedDialogRoot({ children, classes, onOpenChange, closeIcon }: ComposedDialogProps) {
  // Provide classes via context, then resolve children inside the scope
  let resolvedNodes: Node[] = [];
  DialogClassesContext.Provider(classes, () => {
    resolvedNodes = resolveChildren(children);
  });

  // Scan for structural slots
  const { slots } = scanSlots(resolvedNodes);
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

    const handleTriggerClick = () => {
      if (dialog.state.open.peek()) {
        dialog.hide();
      } else {
        dialog.show();
      }
    };
    userTrigger.addEventListener('click', handleTriggerClick);
    _tryOnCleanup(() => userTrigger.removeEventListener('click', handleTriggerClick));
  }

  // Move content children into the dialog panel
  if (contentEntry) {
    for (const node of contentEntry.children) {
      dialog.content.appendChild(node);
    }
  }

  // Sync ARIA IDs: the primitive sets aria-labelledby/aria-describedby on content
  // pointing to its internal title/description elements. The composed sub-components
  // create new elements, so we must set matching IDs on them.
  const titleEl = dialog.content.querySelector('[data-slot="dialog-title"]');
  if (titleEl) titleEl.id = dialog.title.id;
  const descEl = dialog.content.querySelector('[data-slot="dialog-description"]');
  if (descEl) descEl.id = dialog.description.id;

  // Wire close buttons via event delegation (handles nested close buttons)
  const handleContentClick = (e: Event) => {
    const target = (e.target as HTMLElement).closest('[data-slot="dialog-close"]');
    if (target) dialog.hide();
  };
  dialog.content.addEventListener('click', handleContentClick);
  _tryOnCleanup(() => dialog.content.removeEventListener('click', handleContentClick));

  // Add close icon if provided, or use the default close button from the primitive
  if (closeIcon) {
    const handleCloseIconClick = () => dialog.hide();
    closeIcon.addEventListener('click', handleCloseIconClick);
    _tryOnCleanup(() => closeIcon.removeEventListener('click', handleCloseIconClick));
    dialog.content.appendChild(closeIcon);
  }

  return (
    <div style="display: contents">
      {userTrigger}
      {dialog.overlay}
      {dialog.content}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Class key type (for withStyles inference)
// ---------------------------------------------------------------------------

export type DialogClassKey = keyof DialogClasses;

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedDialog = Object.assign(ComposedDialogRoot, {
  Trigger: DialogTrigger,
  Content: DialogContent,
  Title: DialogTitle,
  Description: DialogDescription,
  Header: DialogHeader,
  Footer: DialogFooter,
  Close: DialogClose,
}) as ((props: ComposedDialogProps) => HTMLElement) & {
  __classKeys?: DialogClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
  Title: (props: SlotProps) => HTMLElement;
  Description: (props: SlotProps) => HTMLElement;
  Header: (props: SlotProps) => HTMLElement;
  Footer: (props: SlotProps) => HTMLElement;
  Close: (props: SlotProps) => HTMLElement;
};
