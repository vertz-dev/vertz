/**
 * Composed Tooltip — compound component with delayed hover and floating content.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * No registration phase, no resolveChildren, no internal API imports.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, onMount, useContext } from '@vertz/ui';
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
  classes?: TooltipClasses;
  show: () => void;
  hide: () => void;
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
  return (
    <span
      style="display: contents"
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
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.content, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      role="tooltip"
      id={ctx.contentId}
      data-tooltip-content=""
      aria-hidden={ctx.isOpen ? 'false' : 'true'}
      data-state={ctx.isOpen ? 'open' : 'closed'}
      style={ctx.isOpen ? '' : 'display: none'}
      class={combined || undefined}
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

  let isOpen = false;

  // Track cleanup and timer state. Plain object to avoid signal transforms.
  const state: { showTimeout: ReturnType<typeof setTimeout> | null; floatingCleanup: (() => void) | null } = {
    showTimeout: null,
    floatingCleanup: null,
  };

  // Position the tooltip content relative to the trigger when open.
  onMount(() => {
    const open = isOpen;
    if (!open || !positioning) return;

    const content = document.getElementById(contentId);
    const trigger = content?.parentElement?.querySelector('[data-tooltip-trigger]') as HTMLElement | null;
    if (!trigger || !content) return;

    const result = createFloatingPosition(trigger, content, positioning);
    state.floatingCleanup = result.cleanup;
  });

  function show(): void {
    if (state.showTimeout !== null) return;
    state.showTimeout = setTimeout(() => {
      state.showTimeout = null;
      isOpen = true;
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
    classes,
    show,
    hide,
  };

  return (
    <TooltipContext.Provider value={ctx}>
      <span style="display: contents" data-tooltip-root="">
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
