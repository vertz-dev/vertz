/**
 * Composed AlertDialog — compound component using native <dialog> element.
 * Unlike Dialog, blocks Escape/overlay dismiss and uses Cancel/Action slots.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * No registration phase, no resolveChildren, no internal API imports.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, lifecycleEffect, ref, useContext } from '@vertz/ui';
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
      style="display: contents"
      data-alertdialog-trigger=""
      data-state={ctx.isOpen ? 'open' : 'closed'}
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
  const dialogRef: Ref<HTMLDialogElement> = ref();
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.content, effectiveCls].filter(Boolean).join(' ');

  // Wire cancel handler on the CONNECTED dialog element.
  // AlertDialog prevents Escape dismiss entirely.
  lifecycleEffect(() => {
    const el = document.getElementById(ctx.contentId) as HTMLDialogElement | null;
    if (!el || el.__dialogWired) return;
    el.__dialogWired = true;

    el.addEventListener('cancel', (e: Event) => {
      // AlertDialog does NOT dismiss on Escape.
      e.preventDefault();
    });
  });

  return (
    <dialog
      ref={dialogRef}
      id={ctx.contentId}
      role="alertdialog"
      aria-labelledby={ctx.titleId}
      aria-describedby={ctx.descriptionId}
      data-state={ctx.isOpen ? 'open' : 'closed'}
      class={combined || undefined}
      onCancel={(e: Event) => {
        // AlertDialog blocks Escape dismiss — prevent the native close.
        e.preventDefault();
      }}
    >
      {children}
    </dialog>
  );
}

function AlertDialogTitle({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useAlertDialogContext('Title');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.title, effectiveCls].filter(Boolean).join(' ');
  return (
    <h2 id={ctx.titleId} data-slot="alertdialog-title" class={combined || undefined}>
      {children}
    </h2>
  );
}

function AlertDialogDescription({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useAlertDialogContext('Description');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.description, effectiveCls].filter(Boolean).join(' ');
  return (
    <p id={ctx.descriptionId} data-slot="alertdialog-description" class={combined || undefined}>
      {children}
    </p>
  );
}

function AlertDialogHeader({ children, className: cls, class: classProp }: SlotProps) {
  const { classes } = useAlertDialogContext('Header');
  const effectiveCls = cls ?? classProp;
  const combined = [classes?.header, effectiveCls].filter(Boolean).join(' ');
  return <div class={combined || undefined}>{children}</div>;
}

function AlertDialogFooter({ children, className: cls, class: classProp }: SlotProps) {
  const { classes } = useAlertDialogContext('Footer');
  const effectiveCls = cls ?? classProp;
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
  const ctx = useAlertDialogContext('Cancel');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.cancel, effectiveCls].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      data-slot="alertdialog-cancel"
      class={combined || undefined}
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
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.action, effectiveCls].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      data-slot="alertdialog-action"
      class={combined || undefined}
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

  // Reactive state — compiler transforms `let` to signal.
  let isOpen = false;

  function getConnectedDialog(): HTMLDialogElement | null {
    return document.getElementById(ids.contentId) as HTMLDialogElement | null;
  }

  function showDialog(): void {
    const el = getConnectedDialog();
    if (!el) return;
    const isRenderedOpen =
      el.open || el.hasAttribute('open') || el.getAttribute('data-state') === 'open';
    if (isRenderedOpen) return;

    el.setAttribute('data-state', 'open');
    el.showModal();
    if (!el.open) el.setAttribute('open', '');
  }

  function hideDialog(): void {
    const el = getConnectedDialog();
    if (!el) return;
    const isRenderedOpen =
      el.open || el.hasAttribute('open') || el.getAttribute('data-state') === 'open';
    if (!isRenderedOpen) return;

    el.setAttribute('data-state', 'closed');
    const onEnd = () => {
      el.removeEventListener('animationend', onEnd);
      el.removeAttribute('open');
      if (el.open) el.close();
    };
    el.addEventListener('animationend', onEnd);
    setTimeout(onEnd, 150);
  }

  function open(): void {
    isOpen = true;
    showDialog();
    onOpenChange?.(true);
  }

  function close(): void {
    isOpen = false;
    hideDialog();
    onOpenChange?.(false);
  }

  const ctx: AlertDialogContextValue = {
    isOpen,
    titleId,
    descriptionId,
    contentId: ids.contentId,
    classes,
    onAction,
    open,
    close,
  };

  return (
    <AlertDialogContext.Provider value={ctx}>
      <span style="display: contents" data-alertdialog-root="">
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
