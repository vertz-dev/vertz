/**
 * Composed AlertDialog — fully declarative JSX component with modal and ARIA.
 * Unlike Dialog, blocks Escape/overlay dismiss and adds Cancel/Action slots.
 * Sub-components self-wire via context. No factory wrapping.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, ref, resolveChildren, useContext } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
import { focusFirst, saveFocus, trapFocus } from '../utils/focus';
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
  titleId: string;
  descriptionId: string;
  classes?: AlertDialogClasses;
  onAction?: () => void;
  /** @internal — registers the user trigger for ARIA sync */
  _registerTrigger: (el: HTMLElement) => void;
  /** @internal — registers content children and class */
  _registerContent: (children: ChildValue, cls?: string) => void;
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
// Sub-components — registration via context
// ---------------------------------------------------------------------------

function AlertDialogTrigger({ children }: SlotProps) {
  const ctx = useAlertDialogContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <AlertDialog.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;

  const resolved = resolveChildren(children);
  const userTrigger = resolved.find((n): n is HTMLElement => n instanceof HTMLElement) ?? null;
  if (userTrigger) {
    ctx._registerTrigger(userTrigger);
  }

  return <span style="display: contents">{...resolved}</span>;
}

function AlertDialogContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useAlertDialogContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <AlertDialog.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;

  const effectiveCls = cls ?? classProp;
  ctx._registerContent(children, effectiveCls);

  // Placeholder — Root renders the actual alertdialog element
  return (<span style="display: contents" />) as HTMLElement;
}

// ---------------------------------------------------------------------------
// Sub-components — content elements (read classes from context)
// ---------------------------------------------------------------------------

function AlertDialogTitle({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useAlertDialogContext('Title');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.title, effectiveCls].filter(Boolean).join(' ');
  return (
    <h2 id={ctx.titleId} class={combined || undefined}>
      {children}
    </h2>
  );
}

function AlertDialogDescription({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useAlertDialogContext('Description');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.description, effectiveCls].filter(Boolean).join(' ');
  return (
    <p id={ctx.descriptionId} class={combined || undefined}>
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
  const { classes } = useAlertDialogContext('Cancel');
  const effectiveCls = cls ?? classProp;
  const combined = [classes?.cancel, effectiveCls].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      data-slot="alertdialog-cancel"
      class={combined || undefined}
      onClick={() => {
        onClick?.();
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
  const { classes, onAction } = useAlertDialogContext('Action');
  const effectiveCls = cls ?? classProp;
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

// Helper to build the context value — avoids compiler wrapping an object
// literal in computed(), which breaks the block-vs-object-literal ambiguity.
function buildAlertDialogCtx(
  titleId: string,
  descriptionId: string,
  classes: AlertDialogClasses | undefined,
  onAction: (() => void) | undefined,
  registerTrigger: (el: HTMLElement) => void,
  registerContent: (children: ChildValue, cls?: string) => void,
): AlertDialogContextValue {
  return {
    titleId,
    descriptionId,
    classes,
    onAction,
    _registerTrigger: registerTrigger,
    _registerContent: registerContent,
    _triggerClaimed: false,
    _contentClaimed: false,
  };
}

function ComposedAlertDialogRoot({
  children,
  classes,
  onOpenChange,
  onAction,
}: ComposedAlertDialogProps) {
  const ids = linkedIds('alertdialog');
  const titleId = `${ids.contentId}-title`;
  const descriptionId = `${ids.contentId}-description`;

  // Registration storage — plain object so the compiler doesn't signal-transform it
  const reg: {
    triggerEl: HTMLElement | null;
    contentChildren: ChildValue;
    contentCls: string | undefined;
  } = { triggerEl: null, contentChildren: undefined, contentCls: undefined };

  const ctxValue = buildAlertDialogCtx(
    titleId,
    descriptionId,
    classes,
    onAction,
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
  AlertDialogContext.Provider(ctxValue, () => {
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

  // Wire user trigger — AlertDialog trigger only opens (never closes)
  if (reg.triggerEl) {
    reg.triggerEl.setAttribute('aria-haspopup', 'dialog');
    reg.triggerEl.setAttribute('aria-controls', ids.contentId);
    reg.triggerEl.setAttribute('aria-expanded', 'false');
    reg.triggerEl.setAttribute('data-state', 'closed');

    const triggerEl = reg.triggerEl;
    const handleClick = () => {
      if (!isOpen) open();
    };
    triggerEl.addEventListener('click', handleClick);
    _tryOnCleanup(() => triggerEl.removeEventListener('click', handleClick));
  }

  // Resolve content children
  const contentNodes = resolveChildren(reg.contentChildren);
  const combined = [classes?.content, reg.contentCls].filter(Boolean).join(' ');

  // Create content panel first so we can wire the delegation handler
  const contentPanel = (
    <div
      ref={contentRef}
      role="alertdialog"
      id={ids.contentId}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-hidden={isOpen ? 'false' : 'true'}
      data-state={isOpen ? 'open' : 'closed'}
      style={isOpen ? '' : 'display: none'}
      class={combined || undefined}
    >
      {...contentNodes}
    </div>
  ) as HTMLDivElement;

  // Wire cancel/action delegation on the content panel (explicit for cleanup)
  const handleContentClick = (e: Event) => {
    const target = e.target as HTMLElement;

    if (target.closest('[data-slot="alertdialog-cancel"]')) {
      close();
      return;
    }

    if (target.closest('[data-slot="alertdialog-action"]')) {
      close();
    }
  };
  contentPanel.addEventListener('click', handleContentClick);
  _tryOnCleanup(() => contentPanel.removeEventListener('click', handleContentClick));

  // No Escape key handler — AlertDialog blocks Escape dismiss
  // No overlay click handler — AlertDialog blocks overlay dismiss

  return (
    <div style="display: contents">
      {...resolvedNodes}
      <div
        data-alertdialog-overlay=""
        aria-hidden={isOpen ? 'false' : 'true'}
        data-state={isOpen ? 'open' : 'closed'}
        style={isOpen ? '' : 'display: none'}
        class={classes?.overlay || undefined}
      />
      {contentPanel}
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
