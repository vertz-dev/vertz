/**
 * Composed Tooltip — fully declarative JSX component with delay and ARIA.
 * Sub-components self-wire via context. No factory wrapping.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition } from '../utils/floating';
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
  /** @internal — registers the user trigger element for ARIA sync */
  _registerTrigger: (el: HTMLElement) => void;
  /** @internal — registers content children and class */
  _registerContent: (children: ChildValue, cls?: string) => void;
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
// Sub-components — registration via context
// ---------------------------------------------------------------------------

function TooltipTrigger({ children }: SlotProps) {
  const ctx = useTooltipContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <Tooltip.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;

  const resolved = resolveChildren(children);
  const userTrigger = resolved.find((n): n is HTMLElement => n instanceof HTMLElement) ?? null;
  if (userTrigger) {
    userTrigger.setAttribute('aria-describedby', ctx.contentId);
    ctx._registerTrigger(userTrigger);
  }

  return <span style="display: contents">{...resolved}</span>;
}

function TooltipContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useTooltipContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <Tooltip.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;

  const effectiveCls = cls ?? classProp;
  ctx._registerContent(children, effectiveCls);

  // Placeholder — Root renders the actual tooltip element
  return (<span style="display: contents" />) as HTMLElement;
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

  // Registration storage — plain object so the compiler doesn't signal-transform it
  const reg: {
    triggerEl: HTMLElement | null;
    contentChildren: ChildValue;
    contentCls: string | undefined;
    floatingCleanup: (() => void) | null;
  } = { triggerEl: null, contentChildren: undefined, contentCls: undefined, floatingCleanup: null };

  const ctxValue: TooltipContextValue = {
    contentId,
    classes,
    _registerTrigger: (el) => {
      reg.triggerEl = el;
    },
    _registerContent: (contentChildren, cls) => {
      if (reg.contentChildren === undefined) {
        reg.contentChildren = contentChildren;
        reg.contentCls = cls;
      }
    },
    _triggerClaimed: false,
    _contentClaimed: false,
  };

  // Phase 1: resolve children to collect registrations
  let resolvedNodes: Node[] = [];
  TooltipContext.Provider(ctxValue, () => {
    resolvedNodes = resolveChildren(children);
  });

  // Phase 2: build tooltip content element
  const contentNodes = resolveChildren(reg.contentChildren);
  const combined = [classes?.content, reg.contentCls].filter(Boolean).join(' ');

  const tooltipEl = (
    <div
      role="tooltip"
      id={contentId}
      aria-hidden="true"
      data-state="closed"
      style="display: none"
      class={combined || undefined}
    >
      {...contentNodes}
    </div>
  ) as HTMLElement;

  // Phase 3: show/hide with delay and floating positioning
  let showTimeout: ReturnType<typeof setTimeout> | null = null;

  function showTooltip(): void {
    tooltipEl.setAttribute('aria-hidden', 'false');
    tooltipEl.setAttribute('data-state', 'open');
    tooltipEl.style.display = '';

    if (positioning && reg.triggerEl) {
      const result = createFloatingPosition(reg.triggerEl, tooltipEl, positioning);
      reg.floatingCleanup = result.cleanup;
    }
  }

  function hideTooltip(): void {
    tooltipEl.setAttribute('aria-hidden', 'true');
    tooltipEl.setAttribute('data-state', 'closed');
    tooltipEl.style.display = 'none';

    reg.floatingCleanup?.();
    reg.floatingCleanup = null;
  }

  function show(): void {
    if (showTimeout !== null) return;
    showTimeout = setTimeout(() => {
      showTimeout = null;
      showTooltip();
    }, delay);
  }

  function hide(): void {
    if (showTimeout !== null) {
      clearTimeout(showTimeout);
      showTimeout = null;
    }
    hideTooltip();
  }

  // Wire trigger event handlers
  if (reg.triggerEl) {
    const triggerEl = reg.triggerEl;
    const handleMouseenter = () => show();
    const handleMouseleave = () => hide();
    const handleFocus = () => show();
    const handleBlur = () => hide();
    const handleKeydown = (event: KeyboardEvent) => {
      if (isKey(event, Keys.Escape)) {
        hide();
      }
    };

    triggerEl.addEventListener('mouseenter', handleMouseenter);
    triggerEl.addEventListener('mouseleave', handleMouseleave);
    triggerEl.addEventListener('focus', handleFocus);
    triggerEl.addEventListener('blur', handleBlur);
    triggerEl.addEventListener('keydown', handleKeydown);
    _tryOnCleanup(() => {
      triggerEl.removeEventListener('mouseenter', handleMouseenter);
      triggerEl.removeEventListener('mouseleave', handleMouseleave);
      triggerEl.removeEventListener('focus', handleFocus);
      triggerEl.removeEventListener('blur', handleBlur);
      triggerEl.removeEventListener('keydown', handleKeydown);
    });
  }

  return (
    <div style="display: contents">
      {...resolvedNodes}
      {tooltipEl}
    </div>
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
