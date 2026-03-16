/**
 * Composed Dialog — fully declarative JSX component with modal, focus trap, and ARIA.
 * Sub-components self-wire via context. No factory wrapping.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, ref, resolveChildren, useContext } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
import { focusFirst, saveFocus, trapFocus } from '../utils/focus';
import { linkedIds } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

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
  titleId: string;
  descriptionId: string;
  classes?: DialogClasses;
  /** @internal — registers the user trigger for ARIA sync */
  _registerTrigger: (el: HTMLElement) => void;
  /** @internal — registers content children and class */
  _registerContent: (children: ChildValue, cls?: string) => void;
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
// Sub-components — registration via context
// ---------------------------------------------------------------------------

function DialogTrigger({ children }: SlotProps) {
  const ctx = useDialogContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <Dialog.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;

  const resolved = resolveChildren(children);
  const userTrigger = resolved.find((n): n is HTMLElement => n instanceof HTMLElement) ?? null;
  if (userTrigger) {
    ctx._registerTrigger(userTrigger);
  }

  return <span style="display: contents">{...resolved}</span>;
}

function DialogContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useDialogContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <Dialog.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;

  const effectiveCls = cls ?? classProp;
  ctx._registerContent(children, effectiveCls);

  // Placeholder — Root renders the actual dialog element
  return (<span style="display: contents" />) as HTMLElement;
}

// ---------------------------------------------------------------------------
// Sub-components — content elements (read classes from context)
// ---------------------------------------------------------------------------

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
  const { classes } = useDialogContext('Close');
  const effectiveCls = cls ?? classProp;
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

// ---------------------------------------------------------------------------
// Class key type (for withStyles inference)
// ---------------------------------------------------------------------------

export type DialogClassKey = keyof DialogClasses;

// Helper to build the context value — avoids compiler wrapping an object
// literal in computed(), which breaks the block-vs-object-literal ambiguity.
function buildDialogCtx(
  titleId: string,
  descriptionId: string,
  classes: DialogClasses | undefined,
  registerTrigger: (el: HTMLElement) => void,
  registerContent: (children: ChildValue, cls?: string) => void,
): DialogContextValue {
  return {
    titleId,
    descriptionId,
    classes,
    _registerTrigger: registerTrigger,
    _registerContent: registerContent,
    _triggerClaimed: false,
    _contentClaimed: false,
  };
}

function ComposedDialogRoot({ children, classes, onOpenChange, closeIcon }: ComposedDialogProps) {
  const ids = linkedIds('dialog');
  const titleId = `${ids.contentId}-title`;
  const descriptionId = `${ids.contentId}-description`;

  // Registration storage — plain object so the compiler doesn't signal-transform it
  const reg: {
    triggerEl: HTMLElement | null;
    contentChildren: ChildValue;
    contentCls: string | undefined;
  } = { triggerEl: null, contentChildren: undefined, contentCls: undefined };

  const ctxValue = buildDialogCtx(
    titleId,
    descriptionId,
    classes,
    (el) => {
      reg.triggerEl = el;
    },
    (contentChildren, cls) => {
      if (reg.contentChildren === undefined) {
        reg.contentChildren = contentChildren;
        reg.contentCls = cls;
      }
    },
  );

  // Phase 1: resolve children to collect registrations
  let resolvedNodes: Node[] = [];
  DialogContext.Provider(ctxValue, () => {
    resolvedNodes = resolveChildren(children);
  });

  // Phase 2: reactive state — compiler transforms `let` to signal
  let isOpen = false;
  const contentRef: Ref<HTMLDivElement> = ref();
  let restoreFocus: (() => void) | null = null;
  let removeTrap: (() => void) | null = null;

  function open(): void {
    isOpen = true;
    if (reg.triggerEl) {
      reg.triggerEl.setAttribute('aria-expanded', 'true');
      reg.triggerEl.setAttribute('data-state', 'open');
    }
    restoreFocus = saveFocus();
    const contentEl = contentRef.current;
    if (contentEl) {
      removeTrap = trapFocus(contentEl);
      queueMicrotask(() => focusFirst(contentEl));
    }
    onOpenChange?.(true);
  }

  function close(): void {
    isOpen = false;
    if (reg.triggerEl) {
      reg.triggerEl.setAttribute('aria-expanded', 'false');
      reg.triggerEl.setAttribute('data-state', 'closed');
    }
    removeTrap?.();
    removeTrap = null;
    restoreFocus?.();
    restoreFocus = null;
    onOpenChange?.(false);
  }

  function toggle(): void {
    if (isOpen) close();
    else open();
  }

  // Wire user trigger with ARIA attributes and click handler
  if (reg.triggerEl) {
    reg.triggerEl.setAttribute('aria-haspopup', 'dialog');
    reg.triggerEl.setAttribute('aria-controls', ids.contentId);
    reg.triggerEl.setAttribute('aria-expanded', 'false');
    reg.triggerEl.setAttribute('data-state', 'closed');

    const triggerEl = reg.triggerEl;
    const handleClick = () => toggle();
    triggerEl.addEventListener('click', handleClick);
    _tryOnCleanup(() => triggerEl.removeEventListener('click', handleClick));
  }

  // Wire close icon if provided
  if (closeIcon) {
    const handleCloseIconClick = () => close();
    closeIcon.addEventListener('click', handleCloseIconClick);
    _tryOnCleanup(() => closeIcon.removeEventListener('click', handleCloseIconClick));
  }

  // Resolve content children
  const contentNodes = resolveChildren(reg.contentChildren);
  const combined = [classes?.content, reg.contentCls].filter(Boolean).join(' ');

  // Create content panel first so we can wire the close-delegation handler
  const contentPanel = (
    <div
      ref={contentRef}
      role="dialog"
      id={ids.contentId}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-hidden={isOpen ? 'false' : 'true'}
      data-state={isOpen ? 'open' : 'closed'}
      style={isOpen ? '' : 'display: none'}
      class={combined || undefined}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.Escape)) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      {closeIcon}
      {...contentNodes}
    </div>
  ) as HTMLDivElement;

  // Wire close-button delegation on the content panel (explicit for cleanup)
  const handleContentClick = (e: Event) => {
    const target = (e.target as HTMLElement).closest('[data-slot="dialog-close"]');
    if (target) close();
  };
  contentPanel.addEventListener('click', handleContentClick);
  _tryOnCleanup(() => contentPanel.removeEventListener('click', handleContentClick));

  return (
    <div style="display: contents">
      {...resolvedNodes}
      <div
        data-dialog-overlay=""
        aria-hidden={isOpen ? 'false' : 'true'}
        data-state={isOpen ? 'open' : 'closed'}
        style={isOpen ? '' : 'display: none'}
        class={classes?.overlay || undefined}
        onClick={() => close()}
      />
      {contentPanel}
    </div>
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
  Content: (props: SlotProps) => HTMLElement;
  Title: (props: SlotProps) => HTMLElement;
  Description: (props: SlotProps) => HTMLElement;
  Header: (props: SlotProps) => HTMLElement;
  Footer: (props: SlotProps) => HTMLElement;
  Close: (props: SlotProps) => HTMLElement;
};
