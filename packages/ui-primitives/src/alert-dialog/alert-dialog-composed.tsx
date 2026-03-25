/**
 * Composed AlertDialog — compound component using native <dialog> element.
 * Unlike Dialog, blocks Escape/overlay dismiss and uses Cancel/Action slots.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * No registration phase, no resolveChildren, no internal API imports.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, ref, useContext } from '@vertz/ui';
import { cn } from '../composed/cn';
import { linkedIds } from '../utils/id';

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
  /** Whether the alert dialog is open. Signal auto-unwrapped by Provider. */
  isOpen: boolean;
  titleId: string;
  descriptionId: string;
  contentId: string;
  dialogRef: Ref<HTMLDialogElement>;
  classes?: AlertDialogClasses;
  onAction?: () => void;
  open: () => void;
  close: () => void;
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
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function AlertDialogTrigger({ children }: SlotProps) {
  const ctx = useAlertDialogContext('Trigger');
  return (
    <span
      style={{ display: 'contents' }}
      data-alertdialog-trigger=""
      data-state="closed"
      onClick={() => {
        if (!ctx.isOpen) ctx.open();
      }}
    >
      {children}
    </span>
  );
}

function AlertDialogContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useAlertDialogContext('Content');

  // Use static data-state to avoid reactive element replacement.
  // showDialog()/hideDialog() manage data-state imperatively for animations.
  return (
    <dialog
      ref={ctx.dialogRef}
      id={ctx.contentId}
      role="alertdialog"
      aria-labelledby={ctx.titleId}
      aria-describedby={ctx.descriptionId}
      data-state="closed"
      class={cn(ctx.classes?.content, cls ?? classProp)}
      onCancel={(e: Event) => {
        // AlertDialog blocks Escape dismiss — prevent the native close.
        e.preventDefault();
      }}
    >
      {children}
    </dialog>
  ) as HTMLDialogElement;
}

function AlertDialogTitle({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useAlertDialogContext('Title');
  return (
    <h2
      id={ctx.titleId}
      data-slot="alertdialog-title"
      class={cn(ctx.classes?.title, cls ?? classProp)}
    >
      {children}
    </h2>
  );
}

function AlertDialogDescription({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useAlertDialogContext('Description');
  return (
    <p
      id={ctx.descriptionId}
      data-slot="alertdialog-description"
      class={cn(ctx.classes?.description, cls ?? classProp)}
    >
      {children}
    </p>
  );
}

function AlertDialogHeader({ children, className: cls, class: classProp }: SlotProps) {
  const { classes } = useAlertDialogContext('Header');
  return <div class={cn(classes?.header, cls ?? classProp)}>{children}</div>;
}

function AlertDialogFooter({ children, className: cls, class: classProp }: SlotProps) {
  const { classes } = useAlertDialogContext('Footer');
  return <div class={cn(classes?.footer, cls ?? classProp)}>{children}</div>;
}

function AlertDialogCancel({
  children,
  className: cls,
  class: classProp,
  onClick,
  disabled,
}: ButtonSlotProps) {
  const ctx = useAlertDialogContext('Cancel');
  return (
    <button
      type="button"
      data-slot="alertdialog-cancel"
      class={cn(ctx.classes?.cancel, cls ?? classProp)}
      onClick={() => {
        onClick?.();
        ctx.close();
      }}
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
  const ctx = useAlertDialogContext('Action');
  return (
    <button
      type="button"
      data-slot="alertdialog-action"
      class={cn(ctx.classes?.action, cls ?? classProp)}
      onClick={() => {
        onClick?.();
        ctx.onAction?.();
        ctx.close();
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
  const ids = linkedIds('alertdialog');
  const titleId = `${ids.contentId}-title`;
  const descriptionId = `${ids.contentId}-description`;
  const dialogRef: Ref<HTMLDialogElement> = ref();

  // Reactive state — compiler transforms `let` to signal.
  let isOpen = false;

  function showDialog(): void {
    const el = dialogRef.current;
    if (!el || el.open) return;

    el.setAttribute('data-state', 'open');
    el.showModal();
  }

  function hideDialog(): void {
    const el = dialogRef.current;
    if (!el || !el.open) return;

    el.setAttribute('data-state', 'closed');
    // Force reflow so the browser starts the CSS close animation
    // before any subsequent reactive updates.
    void el.offsetHeight;
    const onEnd = () => {
      el.removeEventListener('animationend', onEnd);
      if (el.open) el.close();
    };
    el.addEventListener('animationend', onEnd);
    setTimeout(onEnd, 200);
  }

  function open(): void {
    isOpen = true;
    showDialog();
    onOpenChange?.(true);
  }

  function close(): void {
    hideDialog();
    isOpen = false;
    onOpenChange?.(false);
  }

  const ctx: AlertDialogContextValue = {
    isOpen,
    titleId,
    descriptionId,
    contentId: ids.contentId,
    dialogRef,
    classes,
    onAction,
    open,
    close,
  };

  return (
    <AlertDialogContext.Provider value={ctx}>
      <span style={{ display: 'contents' }} data-alertdialog-root="">
        {children}
      </span>
    </AlertDialogContext.Provider>
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
