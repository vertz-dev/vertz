/**
 * Composed Dialog — high-level composable component built on top of Dialog.Root.
 * Sub-components self-wire via context. No slot scanning.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
import type { DialogElements, DialogState } from './dialog';
import { Dialog } from './dialog';

// ---------------------------------------------------------------------------
// Class distribution
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

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface DialogContextValue {
  dialog: DialogElements & { state: DialogState };
  classes?: DialogClasses;
  /** @internal — registers the user trigger for ARIA sync */
  _registerTrigger: (el: HTMLElement) => void;
  /** @internal — duplicate sub-component detection */
  _triggerClaimed: boolean;
  _contentClaimed: boolean;
}

const DialogContext = createContext<DialogContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::DialogContext',
);

function useDialogContext(componentName: string): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error(
      `<Dialog.${componentName}> must be used inside <Dialog>. ` +
        'Ensure it is a direct or nested child of the Dialog root component.',
    );
  }
  return ctx;
}

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
// Sub-components — self-wiring via context
// ---------------------------------------------------------------------------

function DialogTrigger({ children }: SlotProps) {
  const ctx = useDialogContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <Dialog.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;
  const { dialog, _registerTrigger } = ctx;

  // Resolve children to find the user's trigger element
  const resolved = resolveChildren(children);
  const userTrigger = resolved.find((n): n is HTMLElement => n instanceof HTMLElement) ?? null;

  if (userTrigger) {
    // Wire ARIA attributes on the user's element
    userTrigger.setAttribute('aria-haspopup', 'dialog');
    userTrigger.setAttribute('aria-controls', dialog.content.id);
    userTrigger.setAttribute('aria-expanded', 'false');
    userTrigger.setAttribute('data-state', 'closed');

    // Delegate click to dialog show/hide
    const handleClick = () => {
      if (dialog.state.open.peek()) {
        dialog.hide();
      } else {
        dialog.show();
      }
    };
    userTrigger.addEventListener('click', handleClick);
    _tryOnCleanup(() => userTrigger.removeEventListener('click', handleClick));

    // Register for ARIA sync on state changes
    _registerTrigger(userTrigger);
  }

  return <span style="display: contents">{...resolved}</span>;
}

function DialogContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useDialogContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <Dialog.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;
  const { dialog, classes } = ctx;
  const effectiveCls = cls ?? classProp;

  // Apply theme + per-instance classes to the primitive's content element
  const combined = [classes?.content, effectiveCls].filter(Boolean).join(' ');
  if (combined) {
    dialog.content.className = combined;
  }

  // Apply overlay class
  if (classes?.overlay) {
    dialog.overlay.className = classes.overlay;
  }

  // Populate the primitive's content element with user children
  const resolved = resolveChildren(children);
  for (const node of resolved) {
    dialog.content.appendChild(node);
  }

  // Sync ARIA IDs: find title/description elements and set their IDs
  const titleEl = dialog.content.querySelector('[data-slot="dialog-title"]');
  if (titleEl) titleEl.id = dialog.title.id;
  const descEl = dialog.content.querySelector('[data-slot="dialog-description"]');
  if (descEl) descEl.id = dialog.description.id;

  // Wire close buttons via event delegation
  const handleContentClick = (e: Event) => {
    const target = (e.target as HTMLElement).closest('[data-slot="dialog-close"]');
    if (target) dialog.hide();
  };
  dialog.content.addEventListener('click', handleContentClick);
  _tryOnCleanup(() => dialog.content.removeEventListener('click', handleContentClick));

  return dialog.content;
}

// ---------------------------------------------------------------------------
// Sub-components — content elements (read classes from context)
// ---------------------------------------------------------------------------

function DialogTitle({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  const { classes } = useDialogContext('Title');
  const combined = [classes?.title, effectiveCls].filter(Boolean).join(' ');
  return (
    <h2 data-slot="dialog-title" class={combined || undefined}>
      {children}
    </h2>
  );
}

function DialogDescription({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  const { classes } = useDialogContext('Description');
  const combined = [classes?.description, effectiveCls].filter(Boolean).join(' ');
  return (
    <p data-slot="dialog-description" class={combined || undefined}>
      {children}
    </p>
  );
}

function DialogHeader({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  const { classes } = useDialogContext('Header');
  const combined = [classes?.header, effectiveCls].filter(Boolean).join(' ');
  return <div class={combined || undefined}>{children}</div>;
}

function DialogFooter({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  const { classes } = useDialogContext('Footer');
  const combined = [classes?.footer, effectiveCls].filter(Boolean).join(' ');
  return <div class={combined || undefined}>{children}</div>;
}

function DialogClose({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  const { classes } = useDialogContext('Close');
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
  // Track the user's trigger element for ARIA sync
  let userTrigger: HTMLElement | null = null;

  // Create the low-level dialog primitive with ARIA sync on state changes
  const dialog = Dialog.Root({
    onOpenChange: (isOpen) => {
      if (userTrigger) {
        userTrigger.setAttribute('aria-expanded', String(isOpen));
        userTrigger.setAttribute('data-state', isOpen ? 'open' : 'closed');
      }
      onOpenChange?.(isOpen);
    },
  });

  // Add close icon if provided
  if (closeIcon) {
    const handleCloseIconClick = () => dialog.hide();
    closeIcon.addEventListener('click', handleCloseIconClick);
    _tryOnCleanup(() => closeIcon.removeEventListener('click', handleCloseIconClick));
    dialog.content.appendChild(closeIcon);
  }

  const ctxValue: DialogContextValue = {
    dialog,
    classes,
    _registerTrigger: (el: HTMLElement) => {
      userTrigger = el;
    },
    _triggerClaimed: false,
    _contentClaimed: false,
  };

  // Provide primitive + classes via context, then resolve children
  // Sub-components (Trigger, Content, Title, etc.) read context and self-wire
  let resolvedNodes: Node[] = [];
  DialogContext.Provider(ctxValue, () => {
    resolvedNodes = resolveChildren(children);
  });

  return (
    <div style="display: contents">
      {...resolvedNodes}
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
