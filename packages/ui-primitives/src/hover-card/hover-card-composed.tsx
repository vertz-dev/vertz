/**
 * Composed HoverCard — declarative JSX component with hover-triggered content.
 * Sub-components self-wire via context. No factory wrapping.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition } from '../utils/floating';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

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
  _registerTrigger: (el: HTMLElement) => void;
  _registerContent: (children: ChildValue, cls?: string) => void;
  _triggerClaimed: boolean;
  _contentClaimed: boolean;
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
// Sub-components
// ---------------------------------------------------------------------------

function HoverCardTrigger({ children }: SlotProps) {
  const ctx = useHoverCardContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <HoverCard.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;

  const resolved = resolveChildren(children);
  const userTrigger = resolved.find((n): n is HTMLElement => n instanceof HTMLElement) ?? null;
  if (userTrigger) {
    ctx._registerTrigger(userTrigger);
  }

  return <span style="display: contents">{...resolved}</span>;
}

function HoverCardContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useHoverCardContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <HoverCard.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;

  const effectiveCls = cls ?? classProp;
  ctx._registerContent(children, effectiveCls);

  return (<span style="display: contents" />) as HTMLElement;
}

// ---------------------------------------------------------------------------
// Root
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

  const reg: {
    triggerEl: HTMLElement | null;
    contentChildren: ChildValue;
    contentCls: string | undefined;
    floatingCleanup: (() => void) | null;
  } = {
    triggerEl: null,
    contentChildren: undefined,
    contentCls: undefined,
    floatingCleanup: null,
  };

  const ctxValue: HoverCardContextValue = {
    _registerTrigger: (el) => {
      reg.triggerEl = el;
    },
    _registerContent: (contentChildren, cls) => {
      reg.contentChildren = contentChildren;
      reg.contentCls = cls;
    },
    _triggerClaimed: false,
    _contentClaimed: false,
  };

  // Phase 1: resolve children to collect registrations
  let resolvedNodes: Node[] = [];
  let contentNodes: Node[] = [];
  HoverCardContext.Provider(ctxValue, () => {
    resolvedNodes = resolveChildren(children);
    contentNodes = resolveChildren(reg.contentChildren);
  });

  // State
  let isOpen = false;
  let openTimeout: ReturnType<typeof setTimeout> | null = null;
  let closeTimeout: ReturnType<typeof setTimeout> | null = null;

  function cancelTimers(): void {
    if (openTimeout) {
      clearTimeout(openTimeout);
      openTimeout = null;
    }
    if (closeTimeout) {
      clearTimeout(closeTimeout);
      closeTimeout = null;
    }
  }

  function cancelCloseTimer(): void {
    if (closeTimeout) {
      clearTimeout(closeTimeout);
      closeTimeout = null;
    }
  }

  function positionContent(): void {
    if (positioning && reg.triggerEl) {
      reg.floatingCleanup?.();
      const effectivePlacement = positioning.placement ?? 'bottom';
      const result = createFloatingPosition(reg.triggerEl, contentEl, {
        ...positioning,
        placement: effectivePlacement,
      });
      reg.floatingCleanup = result.cleanup;
    }
  }

  function show(): void {
    cancelTimers();
    if (isOpen) return;
    openTimeout = setTimeout(() => {
      isOpen = true;
      if (reg.triggerEl) setExpanded(reg.triggerEl, true);
      setHidden(contentEl, false);
      setDataState(contentEl, 'open');
      positionContent();
      onOpenChange?.(true);
      openTimeout = null;
    }, openDelay);
  }

  function showImmediate(): void {
    cancelTimers();
    isOpen = true;
    if (reg.triggerEl) setExpanded(reg.triggerEl, true);
    setHidden(contentEl, false);
    setDataState(contentEl, 'open');
    positionContent();
    onOpenChange?.(true);
  }

  function hide(): void {
    cancelTimers();
    if (!isOpen) return;
    closeTimeout = setTimeout(() => {
      isOpen = false;
      if (reg.triggerEl) setExpanded(reg.triggerEl, false);
      setDataState(contentEl, 'closed');
      setHiddenAnimated(contentEl, true);
      reg.floatingCleanup?.();
      reg.floatingCleanup = null;
      onOpenChange?.(false);
      closeTimeout = null;
    }, closeDelay);
  }

  function hideImmediate(): void {
    cancelTimers();
    isOpen = false;
    if (reg.triggerEl) setExpanded(reg.triggerEl, false);
    setDataState(contentEl, 'closed');
    setHiddenAnimated(contentEl, true);
    reg.floatingCleanup?.();
    reg.floatingCleanup = null;
    onOpenChange?.(false);
  }

  // Build content element
  const combined = [classes?.content, reg.contentCls].filter(Boolean).join(' ');
  const contentEl = (
    <div
      role="dialog"
      id={contentId}
      aria-hidden="true"
      data-state="closed"
      style="display: none"
      class={combined || undefined}
      onMouseenter={cancelCloseTimer}
      onMouseleave={hide}
      onFocusin={cancelCloseTimer}
      onFocusout={(event: FocusEvent) => {
        const related = event.relatedTarget as Node | null;
        if (related && (reg.triggerEl?.contains(related) || contentEl.contains(related))) return;
        hide();
      }}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.Escape)) {
          hideImmediate();
          reg.triggerEl?.focus();
        }
      }}
    >
      {...contentNodes}
    </div>
  ) as HTMLDivElement;

  // Wire trigger
  if (reg.triggerEl) {
    const triggerEl = reg.triggerEl;
    triggerEl.setAttribute('aria-haspopup', 'dialog');
    triggerEl.setAttribute('aria-expanded', 'false');

    triggerEl.addEventListener('mouseenter', show);
    triggerEl.addEventListener('mouseleave', hide);
    triggerEl.addEventListener('focus', showImmediate);
    triggerEl.addEventListener('blur', (event: FocusEvent) => {
      const related = event.relatedTarget as Node | null;
      if (related && (triggerEl.contains(related) || contentEl.contains(related))) return;
      hide();
    });
    triggerEl.addEventListener('keydown', (event: KeyboardEvent) => {
      if (isKey(event, Keys.Escape) && isOpen) {
        hideImmediate();
      }
    });
  }

  return (
    <div style="display: contents">
      {...resolvedNodes}
      {contentEl}
    </div>
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
