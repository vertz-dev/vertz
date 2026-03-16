/**
 * Composed Tooltip — high-level composable component built on Tooltip.Root.
 * Sub-components self-wire via context. No slot scanning.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import type { FloatingOptions } from '../utils/floating';
import type { TooltipElements, TooltipState } from './tooltip';
import { Tooltip } from './tooltip';

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
  tooltip: TooltipElements & { state: TooltipState };
  classes?: TooltipClasses;
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
  const { tooltip } = ctx;

  // Populate the primitive's trigger element with user children
  const resolved = resolveChildren(children);
  for (const node of resolved) {
    tooltip.trigger.appendChild(node);
  }

  // Wire aria-describedby on the user's interactive element (consistent with other composed triggers)
  const userTrigger = resolved.find((n): n is HTMLElement => n instanceof HTMLElement) ?? null;
  if (userTrigger) {
    const contentId = tooltip.content.id;
    userTrigger.setAttribute('aria-describedby', contentId);
  }

  return tooltip.trigger;
}

function TooltipContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useTooltipContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <Tooltip.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;
  const { tooltip, classes } = ctx;
  const effectiveCls = cls ?? classProp;

  // Apply theme + per-instance classes to the primitive's content element
  const combined = [classes?.content, effectiveCls].filter(Boolean).join(' ');
  if (combined) {
    tooltip.content.className = combined;
  }

  // Populate the primitive's content element with user children
  const resolved = resolveChildren(children);
  for (const node of resolved) {
    tooltip.content.appendChild(node);
  }

  return tooltip.content;
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

function ComposedTooltipRoot({ children, classes, delay, positioning }: ComposedTooltipProps) {
  // Create the low-level tooltip primitive
  const tooltip = Tooltip.Root({ delay, positioning });

  // Provide primitive + classes via context, then resolve children
  // Sub-components (Trigger, Content) read context and self-wire
  let resolvedNodes: Node[] = [];
  TooltipContext.Provider(
    { tooltip, classes, _triggerClaimed: false, _contentClaimed: false },
    () => {
      resolvedNodes = resolveChildren(children);
    },
  );

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
