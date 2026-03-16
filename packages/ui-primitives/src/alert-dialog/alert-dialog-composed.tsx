/**
 * Composed AlertDialog — high-level composable component built on AlertDialog.Root.
 * Sub-components self-wire via context. No slot scanning.
 * Unlike Dialog, blocks Escape/overlay dismiss and adds Cancel/Action slots.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
import type { AlertDialogElements, AlertDialogState } from './alert-dialog';
import { AlertDialog } from './alert-dialog';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface AlertDialogClasses {
  overlay?: string;
  content?: string;
  cancel?: string;
  action?: string;
  header?: string;
  title?: string;
  description?: string;
  footer?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AlertDialogContextValue {
  alertDialog: AlertDialogElements & { state: AlertDialogState };
  classes?: AlertDialogClasses;
  onAction?: () => void;
  /** @internal — registers the user trigger for ARIA sync */
  _registerTrigger: (el: HTMLElement) => void;
  /** @internal — duplicate sub-component detection */
  _triggerClaimed: boolean;
  _contentClaimed: boolean;
}

const AlertDialogContext = createContext<AlertDialogContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::AlertDialogContext',
);

function useAlertDialogContext(componentName: string): AlertDialogContextValue {
  const ctx = useContext(AlertDialogContext);
  if (!ctx) {
    throw new Error(
      `<AlertDialog.${componentName}> must be used inside <AlertDialog>. ` +
        'Ensure it is a direct or nested child of the AlertDialog root component.',
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

interface ButtonSlotProps extends SlotProps {
  onClick?: () => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components — self-wiring via context
// ---------------------------------------------------------------------------

function AlertDialogTrigger({ children }: SlotProps) {
  const ctx = useAlertDialogContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <AlertDialog.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;
  const { alertDialog, _registerTrigger } = ctx;

  // Resolve children to find the user's trigger element
  const resolved = resolveChildren(children);
  const userTrigger = resolved.find((n): n is HTMLElement => n instanceof HTMLElement) ?? null;

  if (userTrigger) {
    // Wire ARIA attributes on the user's element
    userTrigger.setAttribute('aria-haspopup', 'dialog');
    userTrigger.setAttribute('aria-controls', alertDialog.content.id);
    userTrigger.setAttribute('aria-expanded', 'false');
    userTrigger.setAttribute('data-state', 'closed');

    // AlertDialog trigger only opens (never closes on click)
    // show() is idempotent — safe to call when already open
    const handleClick = () => alertDialog.show();
    userTrigger.addEventListener('click', handleClick);
    _tryOnCleanup(() => userTrigger.removeEventListener('click', handleClick));

    // Register for ARIA sync on state changes
    _registerTrigger(userTrigger);
  }

  return <span style="display: contents">{...resolved}</span>;
}

function AlertDialogContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useAlertDialogContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <AlertDialog.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;
  const { alertDialog, classes } = ctx;
  const effectiveCls = cls ?? classProp;

  // Apply theme + per-instance classes to the primitive's content element
  const combined = [classes?.content, effectiveCls].filter(Boolean).join(' ');
  if (combined) {
    alertDialog.content.className = combined;
  }

  // Apply overlay class
  if (classes?.overlay) {
    alertDialog.overlay.className = classes.overlay;
  }

  // Populate the primitive's content element with user children
  const resolved = resolveChildren(children);
  for (const node of resolved) {
    alertDialog.content.appendChild(node);
  }

  // Sync ARIA IDs: find title/description elements and set their IDs
  const titleEl = alertDialog.content.querySelector('[data-slot="alertdialog-title"]');
  if (titleEl) titleEl.id = alertDialog.title.id;
  const descEl = alertDialog.content.querySelector('[data-slot="alertdialog-description"]');
  if (descEl) descEl.id = alertDialog.description.id;

  // Wire cancel and action buttons via event delegation
  const handleContentClick = (e: Event) => {
    const target = e.target as HTMLElement;

    if (target.closest('[data-slot="alertdialog-cancel"]')) {
      alertDialog.hide();
      return;
    }

    if (target.closest('[data-slot="alertdialog-action"]')) {
      alertDialog.hide();
    }
  };
  alertDialog.content.addEventListener('click', handleContentClick);
  _tryOnCleanup(() => alertDialog.content.removeEventListener('click', handleContentClick));

  return alertDialog.content;
}

// ---------------------------------------------------------------------------
// Sub-components — content elements (read classes from context)
// ---------------------------------------------------------------------------

function AlertDialogTitle({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  const { classes } = useAlertDialogContext('Title');
  const combined = [classes?.title, effectiveCls].filter(Boolean).join(' ');
  return (
    <h2 data-slot="alertdialog-title" class={combined || undefined}>
      {children}
    </h2>
  );
}

function AlertDialogDescription({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  const { classes } = useAlertDialogContext('Description');
  const combined = [classes?.description, effectiveCls].filter(Boolean).join(' ');
  return (
    <p data-slot="alertdialog-description" class={combined || undefined}>
      {children}
    </p>
  );
}

function AlertDialogHeader({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  const { classes } = useAlertDialogContext('Header');
  const combined = [classes?.header, effectiveCls].filter(Boolean).join(' ');
  return <div class={combined || undefined}>{children}</div>;
}

function AlertDialogFooter({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  const { classes } = useAlertDialogContext('Footer');
  const combined = [classes?.footer, effectiveCls].filter(Boolean).join(' ');
  return <div class={combined || undefined}>{children}</div>;
}

function AlertDialogCancel({
  children,
  className: cls,
  class: classProp,
  onClick,
  disabled,
}: ButtonSlotProps) {
  const effectiveCls = cls ?? classProp;
  const { classes } = useAlertDialogContext('Cancel');
  const combined = [classes?.cancel, effectiveCls].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      data-slot="alertdialog-cancel"
      class={combined || undefined}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function AlertDialogAction({
  children,
  className: cls,
  class: classProp,
  onClick,
  disabled,
}: ButtonSlotProps) {
  const effectiveCls = cls ?? classProp;
  const { classes, onAction } = useAlertDialogContext('Action');
  const combined = [classes?.action, effectiveCls].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      data-slot="alertdialog-action"
      class={combined || undefined}
      onClick={() => {
        onClick?.();
        onAction?.();
      }}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedAlertDialogProps {
  children?: ChildValue;
  classes?: AlertDialogClasses;
  onOpenChange?: (open: boolean) => void;
  onAction?: () => void;
}

// ---------------------------------------------------------------------------
// Class key type (for withStyles inference)
// ---------------------------------------------------------------------------

export type AlertDialogClassKey = keyof AlertDialogClasses;

function ComposedAlertDialogRoot({
  children,
  classes,
  onOpenChange,
  onAction,
}: ComposedAlertDialogProps) {
  // Track the user's trigger element for ARIA sync
  let userTrigger: HTMLElement | null = null;

  // Create the low-level alert dialog primitive with ARIA sync on state changes
  const alertDialog = AlertDialog.Root({
    onOpenChange: (isOpen) => {
      if (userTrigger) {
        userTrigger.setAttribute('aria-expanded', String(isOpen));
        userTrigger.setAttribute('data-state', isOpen ? 'open' : 'closed');
      }
      onOpenChange?.(isOpen);
    },
  });

  const ctxValue: AlertDialogContextValue = {
    alertDialog,
    classes,
    onAction,
    _registerTrigger: (el: HTMLElement) => {
      userTrigger = el;
    },
    _triggerClaimed: false,
    _contentClaimed: false,
  };

  // Provide primitive + classes via context, then resolve children
  let resolvedNodes: Node[] = [];
  AlertDialogContext.Provider(ctxValue, () => {
    resolvedNodes = resolveChildren(children);
  });

  return (
    <div style="display: contents">
      {...resolvedNodes}
      {alertDialog.overlay}
      {alertDialog.content}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedAlertDialog = Object.assign(ComposedAlertDialogRoot, {
  Trigger: AlertDialogTrigger,
  Content: AlertDialogContent,
  Title: AlertDialogTitle,
  Description: AlertDialogDescription,
  Header: AlertDialogHeader,
  Footer: AlertDialogFooter,
  Cancel: AlertDialogCancel,
  Action: AlertDialogAction,
}) as ((props: ComposedAlertDialogProps) => HTMLElement) & {
  __classKeys?: AlertDialogClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
  Title: (props: SlotProps) => HTMLElement;
  Description: (props: SlotProps) => HTMLElement;
  Header: (props: SlotProps) => HTMLElement;
  Footer: (props: SlotProps) => HTMLElement;
  Cancel: (props: ButtonSlotProps) => HTMLElement;
  Action: (props: ButtonSlotProps) => HTMLElement;
};
