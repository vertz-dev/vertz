/**
 * Composed Sheet — compound component using native <dialog> element.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * No registration phase, no resolveChildren, no internal API imports.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, onMount, ref, useContext } from '@vertz/ui';
import { linkedIds } from '../utils/id';
import type { SheetSide } from './sheet';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface SheetClasses {
  overlay?: string;
  content?: string;
  title?: string;
  description?: string;
  close?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface SheetContextValue {
  /** Whether the sheet is open. Signal auto-unwrapped by Provider. */
  isOpen: boolean;
  titleId: string;
  descriptionId: string;
  contentId: string;
  side: SheetSide;
  classes?: SheetClasses;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const SheetContext = createContext<SheetContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::SheetContext',
);

function useSheetContext(componentName: string): SheetContextValue {
  const ctx = useContext(SheetContext);
  if (!ctx) {
    throw new Error(
      `<Sheet.${componentName}> must be used inside <Sheet>. ` +
        'Ensure it is a direct or nested child of the Sheet root component.',
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

interface SheetContentProps extends SlotProps {
  showClose?: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function SheetTrigger({ children }: SlotProps) {
  const ctx = useSheetContext('Trigger');

  return (
    <span
      style="display: contents"
      data-sheet-trigger=""
      data-state={ctx.isOpen ? 'open' : 'closed'}
      onClick={() => ctx.toggle()}
    >
      {children}
    </span>
  );
}

function SheetContent({
  children,
  className: cls,
  class: classProp,
  showClose = true,
}: SheetContentProps) {
  const ctx = useSheetContext('Content');

  const dialogRef: Ref<HTMLDialogElement> = ref();
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.content, effectiveCls].filter(Boolean).join(' ');

  onMount(() => {
    const el = document.getElementById(ctx.contentId) as HTMLDialogElement | null;
    if (!el || el.__dialogWired) return;
    el.__dialogWired = true;

    el.addEventListener('cancel', (e: Event) => {
      e.preventDefault();
      ctx.close();
    });

    el.addEventListener('click', (e: MouseEvent) => {
      if (e.target === el) ctx.close();
    });
  });

  return (
    <dialog
      ref={dialogRef}
      id={ctx.contentId}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ctx.titleId}
      aria-describedby={ctx.descriptionId}
      data-side={ctx.side}
      data-state={ctx.isOpen ? 'open' : 'closed'}
      class={combined || undefined}
      onCancel={() => ctx.close()}
      onClick={(e: MouseEvent) => {
        if (e.target === dialogRef.current) ctx.close();
      }}
    >
      {showClose && (
        <button
          type="button"
          data-slot="sheet-close"
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

function SheetTitle({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useSheetContext('Title');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.title, effectiveCls].filter(Boolean).join(' ');
  return (
    <h2 id={ctx.titleId} class={combined || undefined}>
      {children}
    </h2>
  );
}

function SheetDescription({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useSheetContext('Description');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.description, effectiveCls].filter(Boolean).join(' ');
  return (
    <p id={ctx.descriptionId} class={combined || undefined}>
      {children}
    </p>
  );
}

function SheetClose({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useSheetContext('Close');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.close, effectiveCls].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      data-slot="sheet-close"
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

export interface ComposedSheetProps {
  children?: ChildValue;
  classes?: SheetClasses;
  side?: SheetSide;
  onOpenChange?: (open: boolean) => void;
}

export type SheetClassKey = keyof SheetClasses;

function ComposedSheetRoot({
  children,
  classes,
  side = 'right',
  onOpenChange,
}: ComposedSheetProps) {
  const ids = linkedIds('sheet');
  const titleId = `${ids.contentId}-title`;
  const descriptionId = `${ids.contentId}-description`;

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

  const ctx: SheetContextValue = {
    isOpen,
    titleId,
    descriptionId,
    contentId: ids.contentId,
    side,
    classes,
    open,
    close,
    toggle,
  };

  return (
    <SheetContext.Provider value={ctx}>
      <span style="display: contents" data-sheet-root="">
        {children}
      </span>
    </SheetContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedSheet = Object.assign(ComposedSheetRoot, {
  Trigger: SheetTrigger,
  Content: SheetContent,
  Title: SheetTitle,
  Description: SheetDescription,
  Close: SheetClose,
}) as ((props: ComposedSheetProps) => HTMLElement) & {
  __classKeys?: SheetClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SheetContentProps) => HTMLElement;
  Title: (props: SlotProps) => HTMLElement;
  Description: (props: SlotProps) => HTMLElement;
  Close: (props: SlotProps) => HTMLElement;
};
