/**
 * Composed HoverCard — compound component with hover-triggered floating content.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * No registration phase, no resolveChildren, no internal API imports.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, ref, useContext } from '@vertz/ui';
import { cn } from '../composed/cn';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition } from '../utils/floating';
import { uniqueId } from '../utils/id';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface HoverCardClasses {
  content?: string;
}

export type HoverCardClassKey = keyof HoverCardClasses;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface HoverCardContextValue {
  isOpen: boolean;
  contentId: string;
  triggerRef: Ref<HTMLSpanElement>;
  contentRef: Ref<HTMLDivElement>;
  classes?: HoverCardClasses;
  show: () => void;
  hide: () => void;
  showImmediate: () => void;
  hideImmediate: () => void;
  cancelCloseTimer: () => void;
}

const HoverCardContext = createContext<HoverCardContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::HoverCardContext',
);

function useHoverCardContext(componentName: string): HoverCardContextValue {
  const ctx = useContext(HoverCardContext);
  if (!ctx) {
    throw new Error(
      `<HoverCard.${componentName}> must be used inside <HoverCard>. ` +
        'Ensure it is a direct or nested child of the HoverCard root component.',
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
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function HoverCardTrigger({ children }: SlotProps) {
  const ctx = useHoverCardContext('Trigger');

  // Forward ARIA attrs and focus/blur handlers to the user's child element.
  const childNodes = Array.isArray(children) ? children : [children];
  const childEl = childNodes.find((c): c is HTMLElement => c instanceof HTMLElement);
  if (childEl) {
    childEl.setAttribute('aria-haspopup', 'dialog');
    childEl.setAttribute('aria-expanded', ctx.isOpen ? 'true' : 'false');
    childEl.addEventListener('focus', () => ctx.showImmediate());
    childEl.addEventListener('blur', () => ctx.hide());
  }

  return (
    <span
      ref={ctx.triggerRef}
      style={{ display: 'contents' }}
      data-hovercard-trigger=""
      onMouseenter={() => ctx.show()}
      onMouseleave={() => ctx.hide()}
      onFocusin={() => ctx.showImmediate()}
      onFocusout={() => ctx.hide()}
    >
      {children}
    </span>
  );
}

function HoverCardContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useHoverCardContext('Content');
  return (
    <div
      ref={ctx.contentRef}
      role="dialog"
      id={ctx.contentId}
      data-hovercard-content=""
      aria-hidden={ctx.isOpen ? 'false' : 'true'}
      data-state={ctx.isOpen ? 'open' : 'closed'}
      style={{ display: ctx.isOpen ? '' : 'none' }}
      class={cn(ctx.classes?.content, cls ?? classProp)}
      onMouseenter={() => ctx.cancelCloseTimer()}
      onMouseleave={() => ctx.hide()}
      onFocusin={() => ctx.cancelCloseTimer()}
      onFocusout={() => ctx.hide()}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedHoverCardProps {
  children?: ChildValue;
  classes?: HoverCardClasses;
  openDelay?: number;
  closeDelay?: number;
  onOpenChange?: (open: boolean) => void;
  positioning?: FloatingOptions;
}

function ComposedHoverCardRoot({
  children,
  classes,
  openDelay = 700,
  closeDelay = 300,
  onOpenChange,
  positioning,
}: ComposedHoverCardProps) {
  const contentId = uniqueId('hovercard');
  const triggerRef: Ref<HTMLSpanElement> = ref();
  const contentRef: Ref<HTMLDivElement> = ref();

  let isOpen = false;

  // Timer state. Plain object to avoid signal transforms.
  const timers: {
    open: ReturnType<typeof setTimeout> | null;
    close: ReturnType<typeof setTimeout> | null;
    floatingCleanup: (() => void) | null;
  } = { open: null, close: null, floatingCleanup: null };

  function cancelTimers(): void {
    if (timers.open) {
      clearTimeout(timers.open);
      timers.open = null;
    }
    if (timers.close) {
      clearTimeout(timers.close);
      timers.close = null;
    }
  }

  function cancelCloseTimer(): void {
    if (timers.close) {
      clearTimeout(timers.close);
      timers.close = null;
    }
  }

  function applyFloating(): void {
    const triggerEl = triggerRef.current;
    const contentEl = contentRef.current;
    if (!triggerEl || !contentEl) return;
    contentEl.style.position = 'fixed';
    const floatingOpts = positioning ?? { placement: 'bottom', offset: 4 };
    const result = createFloatingPosition(triggerEl, contentEl, floatingOpts);
    timers.floatingCleanup = result.cleanup;
  }

  function cleanupFloating(): void {
    timers.floatingCleanup?.();
    timers.floatingCleanup = null;
  }

  function show(): void {
    cancelTimers();
    if (isOpen) return;
    timers.open = setTimeout(() => {
      timers.open = null;
      isOpen = true;
      applyFloating();
      onOpenChange?.(true);
    }, openDelay);
  }

  function showImmediate(): void {
    cancelTimers();
    isOpen = true;
    applyFloating();
    onOpenChange?.(true);
  }

  function hide(): void {
    cancelTimers();
    if (!isOpen) return;
    timers.close = setTimeout(() => {
      timers.close = null;
      isOpen = false;
      cleanupFloating();
      onOpenChange?.(false);
    }, closeDelay);
  }

  function hideImmediate(): void {
    cancelTimers();
    isOpen = false;
    cleanupFloating();
    onOpenChange?.(false);
  }

  const ctx: HoverCardContextValue = {
    isOpen,
    contentId,
    triggerRef,
    contentRef,
    classes,
    show,
    hide,
    showImmediate,
    hideImmediate,
    cancelCloseTimer,
  };

  return (
    <HoverCardContext.Provider value={ctx}>
      <span style={{ display: 'contents' }} data-hovercard-root="">
        {children}
      </span>
    </HoverCardContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedHoverCard = Object.assign(ComposedHoverCardRoot, {
  Trigger: HoverCardTrigger,
  Content: HoverCardContent,
}) as ((props: ComposedHoverCardProps) => HTMLElement) & {
  __classKeys?: HoverCardClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
};
