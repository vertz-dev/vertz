/**
 * Composed Dialog — compound component using native <dialog> element.
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
  /** Whether the dialog is open. Signal auto-unwrapped by Provider. */
  isOpen: boolean;
  titleId: string;
  descriptionId: string;
  contentId: string;
  dialogRef: Ref<HTMLDialogElement>;
  classes?: DialogClasses;
  open: () => void;
  close: () => void;
  toggle: () => void;
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

interface DialogContentProps extends SlotProps {
  showClose?: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function DialogTrigger({ children }: SlotProps) {
  const ctx = useDialogContext('Trigger');
  return (
    <span
      style={{ display: 'contents' }}
      data-dialog-trigger=""
      data-state="closed"
      onClick={() => ctx.toggle()}
    >
      {children}
    </span>
  );
}

function DialogContent({
  children,
  className: cls,
  class: classProp,
  showClose = true,
}: DialogContentProps) {
  const ctx = useDialogContext('Content');

  // Use static data-state to avoid reactive element replacement.
  // showDialog()/hideDialog() manage data-state imperatively for animations.
  const el = (
    <dialog
      ref={ctx.dialogRef}
      id={ctx.contentId}
      role="dialog"
      aria-labelledby={ctx.titleId}
      aria-describedby={ctx.descriptionId}
      data-state="closed"
      class={cn(ctx.classes?.content, cls ?? classProp)}
      onCancel={(e: Event) => {
        // Prevent native close so the CSS exit animation can play.
        e.preventDefault();
        ctx.close();
      }}
      onClick={(e: MouseEvent) => {
        // Clicking the <dialog> backdrop (not content inside) closes the dialog.
        // When showModal() is used, clicking outside the dialog content but
        // inside the viewport hits the <dialog> element itself as the target.
        if (e.target === ctx.dialogRef.current) ctx.close();
      }}
    >
      {showClose && (
        <button
          type="button"
          data-slot="dialog-close"
          class={cn(ctx.classes?.close)}
          aria-label="Close"
          onClick={() => ctx.close()}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}
      {children}
    </dialog>
  ) as HTMLDialogElement;
  return el;
}

function DialogTitle({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useDialogContext('Title');
  return (
    <h2 id={ctx.titleId} class={cn(ctx.classes?.title, cls ?? classProp)}>
      {children}
    </h2>
  );
}

function DialogDescription({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useDialogContext('Description');
  return (
    <p id={ctx.descriptionId} class={cn(ctx.classes?.description, cls ?? classProp)}>
      {children}
    </p>
  );
}

function DialogHeader({ children, className: cls, class: classProp }: SlotProps) {
  const { classes } = useDialogContext('Header');
  return <div class={cn(classes?.header, cls ?? classProp)}>{children}</div>;
}

function DialogFooter({ children, className: cls, class: classProp }: SlotProps) {
  const { classes } = useDialogContext('Footer');
  return <div class={cn(classes?.footer, cls ?? classProp)}>{children}</div>;
}

function DialogClose({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useDialogContext('Close');
  return (
    <button
      type="button"
      data-slot="dialog-close"
      class={cn(ctx.classes?.close, cls ?? classProp)}
      aria-label={children ? undefined : 'Close'}
      onClick={() => ctx.close()}
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
}

// ---------------------------------------------------------------------------
// Class key type (for withStyles inference)
// ---------------------------------------------------------------------------

export type DialogClassKey = keyof DialogClasses;

function ComposedDialogRoot({ children, classes, onOpenChange }: ComposedDialogProps) {
  const ids = linkedIds('dialog');
  const titleId = `${ids.contentId}-title`;
  const descriptionId = `${ids.contentId}-description`;
  const dialogRef: Ref<HTMLDialogElement> = ref();

  // Reactive state — compiler transforms `let` to signal.
  // Passed directly in context so Provider auto-wraps via wrapSignalProps.
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

  function toggle(): void {
    if (isOpen) close();
    else open();
  }

  const ctx: DialogContextValue = {
    isOpen,
    titleId,
    descriptionId,
    contentId: ids.contentId,
    dialogRef,
    classes,
    open,
    close,
    toggle,
  };

  // JSX Provider with single-root wrapper.
  // Children evaluate in DOM order inside the Provider scope.
  return (
    <DialogContext.Provider value={ctx}>
      <span style={{ display: 'contents' }} data-dialog-root="">
        {children}
      </span>
    </DialogContext.Provider>
  );
}

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
  Content: (props: DialogContentProps) => HTMLElement;
  Title: (props: SlotProps) => HTMLElement;
  Description: (props: SlotProps) => HTMLElement;
  Header: (props: SlotProps) => HTMLElement;
  Footer: (props: SlotProps) => HTMLElement;
  Close: (props: SlotProps) => HTMLElement;
};
