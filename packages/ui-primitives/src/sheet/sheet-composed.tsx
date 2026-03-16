/**
 * Composed Sheet — fully declarative JSX component with slide panel, focus trap, and ARIA.
 * Sub-components self-wire via context. No factory wrapping.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, ref, resolveChildren, useContext } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
import { focusFirst, saveFocus, trapFocus } from '../utils/focus';
import { linkedIds } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';
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
  titleId: string;
  descriptionId: string;
  classes?: SheetClasses;
  /** @internal — registers the user trigger for ARIA sync */
  _registerTrigger: (el: HTMLElement) => void;
  /** @internal — registers content children and class */
  _registerContent: (children: ChildValue, cls?: string) => void;
  /** @internal — duplicate sub-component detection */
  _triggerClaimed: boolean;
  _contentClaimed: boolean;
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

// ---------------------------------------------------------------------------
// Sub-components — registration via context
// ---------------------------------------------------------------------------

function SheetTrigger({ children }: SlotProps) {
  const ctx = useSheetContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <Sheet.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;

  const resolved = resolveChildren(children);
  const userTrigger = resolved.find((n): n is HTMLElement => n instanceof HTMLElement) ?? null;
  if (userTrigger) {
    ctx._registerTrigger(userTrigger);
  }

  return <span style="display: contents">{...resolved}</span>;
}

function SheetContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useSheetContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <Sheet.Content> detected – only the first is used');
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
  const { classes } = useSheetContext('Close');
  const effectiveCls = cls ?? classProp;
  const combined = [classes?.close, effectiveCls].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      data-slot="sheet-close"
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

  // Registration storage — plain object so the compiler doesn't signal-transform it
  const reg: {
    triggerEl: HTMLElement | null;
    contentNodes: Node[];
    contentCls: string | undefined;
    contentRegistered: boolean;
  } = { triggerEl: null, contentNodes: [], contentCls: undefined, contentRegistered: false };

  const ctxValue: SheetContextValue = {
    titleId,
    descriptionId,
    classes,
    _registerTrigger: (el) => {
      reg.triggerEl = el;
    },
    _registerContent: (contentChildren, cls) => {
      if (!reg.contentRegistered) {
        reg.contentRegistered = true;
        // Resolve content children immediately while still inside the Provider scope
        // so that nested sub-components (Title, Description, Close) can access context
        reg.contentNodes = resolveChildren(contentChildren);
        reg.contentCls = cls;
      }
    },
    _triggerClaimed: false,
    _contentClaimed: false,
  };

  // Phase 1: resolve children to collect registrations
  let resolvedNodes: Node[] = [];
  SheetContext.Provider(ctxValue, () => {
    resolvedNodes = resolveChildren(children);
  });

  // Phase 2: reactive state — compiler transforms `let` to signal
  let isOpen = false;
  const contentRef: Ref<HTMLDivElement> = ref();
  let restoreFocus: (() => void) | null = null;
  let removeTrap: (() => void) | null = null;

  // Swipe-to-dismiss state — plain vars, not signals
  const swipe = { startX: 0, startY: 0 };
  const SWIPE_THRESHOLD = 50;

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

  // Wire user trigger — Sheet trigger only opens (never toggles)
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

  const combined = [classes?.content, reg.contentCls].filter(Boolean).join(' ');

  // Create content panel first so we can wire the close-delegation handler
  const contentPanel = (
    <div
      ref={contentRef}
      role="dialog"
      id={ids.contentId}
      data-side={side}
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
      onPointerdown={(e: PointerEvent) => {
        swipe.startX = e.clientX;
        swipe.startY = e.clientY;
      }}
      onPointerup={(e: PointerEvent) => {
        if (!isOpen) return;
        const deltaX = e.clientX - swipe.startX;
        const deltaY = e.clientY - swipe.startY;
        const shouldDismiss =
          (side === 'right' && deltaX >= SWIPE_THRESHOLD) ||
          (side === 'left' && deltaX <= -SWIPE_THRESHOLD) ||
          (side === 'bottom' && deltaY >= SWIPE_THRESHOLD) ||
          (side === 'top' && deltaY <= -SWIPE_THRESHOLD);
        if (shouldDismiss) close();
      }}
    >
      {...reg.contentNodes}
    </div>
  ) as HTMLDivElement;

  // Wire close-button delegation on the content panel (explicit for cleanup)
  const handleContentClick = (e: Event) => {
    const target = (e.target as HTMLElement).closest('[data-slot="sheet-close"]');
    if (target) close();
  };
  contentPanel.addEventListener('click', handleContentClick);
  _tryOnCleanup(() => contentPanel.removeEventListener('click', handleContentClick));

  return (
    <div style="display: contents">
      {...resolvedNodes}
      <div
        data-sheet-overlay=""
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

export const ComposedSheet = Object.assign(ComposedSheetRoot, {
  Trigger: SheetTrigger,
  Content: SheetContent,
  Title: SheetTitle,
  Description: SheetDescription,
  Close: SheetClose,
}) as ((props: ComposedSheetProps) => HTMLElement) & {
  __classKeys?: SheetClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
  Title: (props: SlotProps) => HTMLElement;
  Description: (props: SlotProps) => HTMLElement;
  Close: (props: SlotProps) => HTMLElement;
};
