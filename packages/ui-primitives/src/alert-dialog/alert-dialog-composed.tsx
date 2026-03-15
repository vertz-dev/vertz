/**
 * Composed AlertDialog — high-level composable component built on AlertDialog.Root.
 * Like Dialog composed, but blocks Escape/overlay dismiss and adds Cancel/Action slots.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { scanSlots } from '../composed/scan-slots';
import { AlertDialog } from './alert-dialog';

// ---------------------------------------------------------------------------
// Class distribution context
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

const AlertDialogClassesContext = createContext<AlertDialogClasses | undefined>(
  undefined,
  '@vertz/ui-primitives::AlertDialogClassesContext',
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

function AlertDialogTrigger({ children }: SlotProps) {
  return (
    <span data-slot="alertdialog-trigger" style="display: contents">
      {children}
    </span>
  );
}

function AlertDialogContent({ children, class: cls }: SlotProps) {
  return (
    <div data-slot="alertdialog-content" data-class={cls || undefined} style="display: contents">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components — content elements (read classes from context)
// ---------------------------------------------------------------------------

function AlertDialogTitle({ children, class: cls }: SlotProps) {
  const classes = useContext(AlertDialogClassesContext);
  const combined = [classes?.title, cls].filter(Boolean).join(' ');
  return <h2 class={combined || undefined}>{children}</h2>;
}

function AlertDialogDescription({ children, class: cls }: SlotProps) {
  const classes = useContext(AlertDialogClassesContext);
  const combined = [classes?.description, cls].filter(Boolean).join(' ');
  return <p class={combined || undefined}>{children}</p>;
}

function AlertDialogHeader({ children, class: cls }: SlotProps) {
  const classes = useContext(AlertDialogClassesContext);
  const combined = [classes?.header, cls].filter(Boolean).join(' ');
  return <div class={combined || undefined}>{children}</div>;
}

function AlertDialogFooter({ children, class: cls }: SlotProps) {
  const classes = useContext(AlertDialogClassesContext);
  const combined = [classes?.footer, cls].filter(Boolean).join(' ');
  return <div class={combined || undefined}>{children}</div>;
}

function AlertDialogCancel({ children, class: cls }: SlotProps) {
  const classes = useContext(AlertDialogClassesContext);
  const combined = [classes?.cancel, cls].filter(Boolean).join(' ');
  return (
    <button type="button" data-slot="alertdialog-cancel" class={combined || undefined}>
      {children}
    </button>
  );
}

function AlertDialogAction({ children, class: cls }: SlotProps) {
  const classes = useContext(AlertDialogClassesContext);
  const combined = [classes?.action, cls].filter(Boolean).join(' ');
  return (
    <button type="button" data-slot="alertdialog-action" class={combined || undefined}>
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
  // Provide classes via context, then resolve children inside the scope
  let resolvedNodes: Node[] = [];
  AlertDialogClassesContext.Provider(classes, () => {
    resolvedNodes = resolveChildren(children);
  });

  // Scan for structural slots
  const { slots } = scanSlots(resolvedNodes);
  const triggerEntry = slots.get('alertdialog-trigger')?.[0];
  const contentEntry = slots.get('alertdialog-content')?.[0];

  // Extract user trigger element (needed before AlertDialog.Root to wrap onOpenChange)
  const userTrigger = triggerEntry
    ? ((triggerEntry.element.firstElementChild as HTMLElement) ?? triggerEntry.element)
    : null;

  // Create the low-level alert dialog primitive, wrapping onOpenChange to sync trigger ARIA
  const alertDialog = AlertDialog.Root({
    onOpenChange: (isOpen) => {
      if (userTrigger) {
        userTrigger.setAttribute('aria-expanded', String(isOpen));
        userTrigger.setAttribute('data-state', isOpen ? 'open' : 'closed');
      }
      onOpenChange?.(isOpen);
    },
    onAction,
  });

  // Apply overlay class
  if (classes?.overlay) {
    alertDialog.overlay.className = classes.overlay;
  }

  // Apply content class (from classes prop + per-instance class)
  const contentInstanceClass = contentEntry?.attrs.class;
  const contentClassCombined = [classes?.content, contentInstanceClass].filter(Boolean).join(' ');
  if (contentClassCombined) {
    alertDialog.content.className = contentClassCombined;
  }

  // Wire the user's trigger: ARIA attributes + click handler
  if (userTrigger) {
    userTrigger.setAttribute('aria-haspopup', 'dialog');
    userTrigger.setAttribute('aria-controls', alertDialog.content.id);
    userTrigger.setAttribute('aria-expanded', 'false');
    userTrigger.setAttribute('data-state', 'closed');

    userTrigger.addEventListener('click', () => {
      if (!alertDialog.state.open.peek()) {
        alertDialog.show();
      }
    });
  }

  // Move content children into the alert dialog panel
  if (contentEntry) {
    for (const node of contentEntry.children) {
      alertDialog.content.appendChild(node);
    }
  }

  // Wire cancel buttons via event delegation
  alertDialog.content.addEventListener('click', (e) => {
    const cancelTarget = (e.target as HTMLElement).closest('[data-slot="alertdialog-cancel"]');
    if (cancelTarget) alertDialog.hide();

    const actionTarget = (e.target as HTMLElement).closest('[data-slot="alertdialog-action"]');
    if (actionTarget) {
      onAction?.();
      alertDialog.hide();
    }
  });

  return (
    <div style="display: contents">
      {userTrigger}
      {alertDialog.overlay}
      {alertDialog.content}
    </div>
  ) as HTMLDivElement;
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
  Cancel: (props: SlotProps) => HTMLElement;
  Action: (props: SlotProps) => HTMLElement;
};
