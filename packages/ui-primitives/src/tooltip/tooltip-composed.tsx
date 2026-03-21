/**
 * Composed Tooltip — compound component with delayed hover and floating content.
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

export interface TooltipClasses {
  content?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface TooltipContextValue {
  isOpen: boolean;
  contentId: string;
  contentRef: Ref<HTMLDivElement>;
  classes?: TooltipClasses;
  show: () => void;
  hide: () => void;
  _triggerCount: { value: number };
  _contentCount: { value: number };
}

const TooltipContext = createContext<TooltipContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::TooltipContext',
);

function useTooltipContext(componentName: string): TooltipContextValue {
  const ctx = useContext(TooltipContext);
  if (!ctx) {
    throw new Error(
      `<Tooltip.${componentName}> must be used inside <Tooltip>. ` +
        'Ensure it is a direct or nested child of the Tooltip root component.',
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

function TooltipTrigger({ children }: SlotProps) {
  const ctx = useTooltipContext('Trigger');
  const idx = ctx._triggerCount.value++;
  if (idx > 0) console.warn('Duplicate <Tooltip.Trigger> detected – only the first is used');

  // Forward aria-describedby to the user's child HTMLElement.
  const childNodes = Array.isArray(children) ? children : [children];
  const childEl = childNodes.find((c): c is HTMLElement => c instanceof HTMLElement);
  if (childEl) {
    childEl.setAttribute('aria-describedby', ctx.contentId);
  }

  return (
    <span
      style={{ display: 'contents' }}
      data-tooltip-trigger=""
      aria-describedby={ctx.contentId}
      onMouseenter={() => ctx.show()}
      onMouseleave={() => ctx.hide()}
      onFocus={() => ctx.show()}
      onBlur={() => ctx.hide()}
    >
      {children}
    </span>
  );
}

function TooltipContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useTooltipContext('Content');
  const idx = ctx._contentCount.value++;
  if (idx > 0) console.warn('Duplicate <Tooltip.Content> detected – only the first is used');
  return (
    <div
      ref={ctx.contentRef}
      role="tooltip"
      id={ctx.contentId}
      data-tooltip-content=""
      aria-hidden={ctx.isOpen ? 'false' : 'true'}
      data-state={ctx.isOpen ? 'open' : 'closed'}
      style={{ display: ctx.isOpen ? '' : 'none' }}
      class={cn(ctx.classes?.content, cls ?? classProp)}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedTooltipProps {
  children?: ChildValue;
  classes?: TooltipClasses;
  delay?: number;
  positioning?: FloatingOptions;
}

export type TooltipClassKey = keyof TooltipClasses;

function ComposedTooltipRoot({
  children,
  classes,
  delay = 300,
  positioning,
}: ComposedTooltipProps) {
  const contentId = uniqueId('tooltip');
  const contentRef: Ref<HTMLDivElement> = ref();

  let isOpen = false;

  // Track cleanup and timer state. Plain object to avoid signal transforms.
  const state: {
    showTimeout: ReturnType<typeof setTimeout> | null;
    floatingCleanup: (() => void) | null;
  } = {
    showTimeout: null,
    floatingCleanup: null,
  };

  function applyPositioning(): void {
    const content = contentRef.current;
    const triggerSpan = content?.parentElement?.querySelector(
      '[data-tooltip-trigger]',
    ) as HTMLElement | null;
    if (!triggerSpan || !content) return;

    // Trigger span uses display:contents (no layout box).
    // Use its first child element for positioning.
    const trigger = (triggerSpan.firstElementChild as HTMLElement) ?? triggerSpan;
    content.style.position = 'fixed';
    const floatingOpts = positioning ?? { placement: 'top', offset: 4 };
    const result = createFloatingPosition(trigger, content, floatingOpts);
    state.floatingCleanup = result.cleanup;
  }

  function show(): void {
    if (state.showTimeout !== null) return;
    state.showTimeout = setTimeout(() => {
      state.showTimeout = null;
      isOpen = true;
      applyPositioning();
    }, delay);
  }

  function hide(): void {
    if (state.showTimeout !== null) {
      clearTimeout(state.showTimeout);
      state.showTimeout = null;
    }
    isOpen = false;
    state.floatingCleanup?.();
    state.floatingCleanup = null;
  }

  const ctx: TooltipContextValue = {
    isOpen,
    contentId,
    contentRef,
    classes,
    show,
    hide,
    _triggerCount: { value: 0 },
    _contentCount: { value: 0 },
  };

  return (
    <TooltipContext.Provider value={ctx}>
      <span style={{ display: 'contents' }} data-tooltip-root="">
        {children}
      </span>
    </TooltipContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedTooltip = Object.assign(ComposedTooltipRoot, {
  Trigger: TooltipTrigger,
  Content: TooltipContent,
}) as ((props: ComposedTooltipProps) => HTMLElement) & {
  __classKeys?: TooltipClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
};
