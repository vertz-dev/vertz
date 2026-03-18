/**
 * Composed Dialog — compound component using native <dialog> element.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * No registration phase, no resolveChildren, no internal API imports.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, onMount, ref, useContext } from '@vertz/ui';
import { linkedIds } from '../utils/id';

// Augment HTMLDialogElement to track whether we've wired imperative handlers.
declare global {
  interface HTMLDialogElement {
    __dialogWired?: boolean;
  }
}

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
      style="display: contents"
      data-dialog-trigger=""
      data-state={ctx.isOpen ? 'open' : 'closed'}
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
  const dialogRef: Ref<HTMLDialogElement> = ref();
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.content, effectiveCls].filter(Boolean).join(' ');

  // Sync native <dialog> open/close state from reactive signal.
  // onMount is a no-op during SSR (avoids missing .showModal()).
  // Read ctx.isOpen BEFORE the null check so the signal is always tracked.
  // Query the dialog by ID rather than using the ref — during hydration,
  // the ref may point to an orphaned element while the connected one
  // is the SSR-claimed element in the DOM.
  // Wire cancel/click handlers on the CONNECTED dialog element.
  // JSX event handlers end up on the orphaned element during hydration,
  // so we attach imperatively to the element found by ID.
  onMount(() => {
    const el = document.getElementById(ctx.contentId) as HTMLDialogElement | null;
    if (!el || el.__dialogWired) return;
    el.__dialogWired = true;

    el.addEventListener('cancel', (e: Event) => {
      // Prevent native close so we can animate the exit.
      e.preventDefault();
      ctx.close();
    });

    el.addEventListener('click', (e: MouseEvent) => {
      // Backdrop click: showModal() makes the <dialog> itself the backdrop target.
      if (e.target === el) ctx.close();
    });
  });

  return (
    <dialog
      ref={dialogRef}
      id={ctx.contentId}
      role="dialog"
      aria-labelledby={ctx.titleId}
      aria-describedby={ctx.descriptionId}
      data-state={ctx.isOpen ? 'open' : 'closed'}
      class={combined || undefined}
      onCancel={() => {
        // Browser closes the dialog natively on Escape.
        // Sync our reactive state to match.
        ctx.close();
      }}
      onClick={(e: MouseEvent) => {
        // Clicking the <dialog> backdrop (not content inside) closes the dialog.
        // When showModal() is used, clicking outside the dialog content but
        // inside the viewport hits the <dialog> element itself as the target.
        if (e.target === dialogRef.current) ctx.close();
      }}
    >
      {showClose && (
        <button
          type="button"
          data-slot="dialog-close"
          class={ctx.classes?.close || undefined}
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
  );
}

function DialogTitle({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useDialogContext('Title');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.title, effectiveCls].filter(Boolean).join(' ');
  return (
    <h2 id={ctx.titleId} class={combined || undefined}>
      {children}
    </h2>
  );
}

function DialogDescription({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useDialogContext('Description');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.description, effectiveCls].filter(Boolean).join(' ');
  return (
    <p id={ctx.descriptionId} class={combined || undefined}>
      {children}
    </p>
  );
}

function DialogHeader({ children, className: cls, class: classProp }: SlotProps) {
  const { classes } = useDialogContext('Header');
  const effectiveCls = cls ?? classProp;
  const combined = [classes?.header, effectiveCls].filter(Boolean).join(' ');
  return <div class={combined || undefined}>{children}</div>;
}

function DialogFooter({ children, className: cls, class: classProp }: SlotProps) {
  const { classes } = useDialogContext('Footer');
  const effectiveCls = cls ?? classProp;
  const combined = [classes?.footer, effectiveCls].filter(Boolean).join(' ');
  return <div class={combined || undefined}>{children}</div>;
}

function DialogClose({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useDialogContext('Close');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.close, effectiveCls].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      data-slot="dialog-close"
      class={combined || undefined}
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

  // Reactive state — compiler transforms `let` to signal.
  // Passed directly in context so Provider auto-wraps via wrapSignalProps.
  let isOpen = false;

  function getConnectedDialog(): HTMLDialogElement | null {
    return document.getElementById(ids.contentId) as HTMLDialogElement | null;
  }

  function showDialog(): void {
    const el = getConnectedDialog();
    if (!el || el.open) return;

    el.setAttribute('data-state', 'open');
    el.showModal();
  }

  function hideDialog(): void {
    const el = getConnectedDialog();
    if (!el || !el.open) return;

    el.setAttribute('data-state', 'closed');
    const onEnd = () => {
      el.removeEventListener('animationend', onEnd);
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

  function toggle(): void {
    if (isOpen) close();
    else open();
  }

  const ctx: DialogContextValue = {
    isOpen,
    titleId,
    descriptionId,
    contentId: ids.contentId,
    classes,
    open,
    close,
    toggle,
  };

  // JSX Provider with single-root wrapper.
  // Children evaluate in DOM order inside the Provider scope.
  return (
    <DialogContext.Provider value={ctx}>
      <span style="display: contents" data-dialog-root="">
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
