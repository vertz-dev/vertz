/**
 * Composed Tooltip — fully declarative JSX component with delay and ARIA.
 * Sub-components self-wire via context. No factory wrapping.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

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
  contentId: string;
  classes?: TooltipClasses;
  show: () => void;
  hide: () => void;
  /** @internal — duplicate sub-component detection */
  _triggerClaimed: boolean;
  _contentClaimed: boolean;
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
// Sub-components — self-wiring via context
// ---------------------------------------------------------------------------

function TooltipTrigger({ children }: SlotProps) {
  const ctx = useTooltipContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <Tooltip.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;

  return (
    <span
      aria-describedby={ctx.contentId}
      onMouseenter={ctx.show}
      onMouseleave={ctx.hide}
      onFocus={ctx.show}
      onBlur={ctx.hide}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.Escape)) {
          ctx.hide();
        }
      }}
    >
      {children}
    </span>
  );
}

function TooltipContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useTooltipContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <Tooltip.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.content, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      role="tooltip"
      id={ctx.contentId}
      aria-hidden="true"
      data-state="closed"
      style="display: none"
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
}

export type TooltipClassKey = keyof TooltipClasses;

// Helper to build the context value — avoids compiler wrapping an object
// literal in computed(), which breaks the block-vs-object-literal ambiguity.
function buildTooltipCtx(
  contentId: string,
  classes: TooltipClasses | undefined,
  show: () => void,
  hide: () => void,
): TooltipContextValue {
  return {
    contentId,
    classes,
    show,
    hide,
    _triggerClaimed: false,
    _contentClaimed: false,
  };
}

function ComposedTooltipRoot({ children, classes, delay = 300 }: ComposedTooltipProps) {
  const contentId = uniqueId('tooltip');

  // Delay timer for show (non-reactive, plain mutable)
  let showTimeout: ReturnType<typeof setTimeout> | null = null;

  function show(): void {
    if (showTimeout !== null) return;
    showTimeout = setTimeout(() => {
      showTimeout = null;
    }, delay);
  }

  function hide(): void {
    if (showTimeout !== null) {
      clearTimeout(showTimeout);
      showTimeout = null;
    }
  }

  // Build context value via helper to avoid compiler computed() wrapping
  const ctxValue = buildTooltipCtx(contentId, classes, show, hide);

  // Provide context, then resolve children
  // Sub-components (Trigger, Content) read context and render their own JSX
  let resolvedNodes: Node[] = [];
  TooltipContext.Provider(ctxValue, () => {
    resolvedNodes = resolveChildren(children);
  });

  return <div style="display: contents">{...resolvedNodes}</div>;
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
