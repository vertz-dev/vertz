/**
 * Composed Tooltip — high-level composable component built on Tooltip.Root.
 * Handles slot scanning, trigger wiring, and class distribution.
 */

import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import { scanSlots } from '../composed/scan-slots';
import { Tooltip } from './tooltip';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface TooltipClasses {
  content?: string;
}

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface SlotProps {
  children?: ChildValue;
  class?: string;
}

// ---------------------------------------------------------------------------
// Sub-components — structural slot markers
// ---------------------------------------------------------------------------

function TooltipTrigger({ children }: SlotProps) {
  return (
    <span data-slot="tooltip-trigger" style="display: contents">
      {children}
    </span>
  );
}

function TooltipContent({ children, class: cls }: SlotProps) {
  return (
    <div data-slot="tooltip-content" data-class={cls || undefined} style="display: contents">
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

function ComposedTooltipRoot({ children, classes, delay }: ComposedTooltipProps) {
  // Resolve children for slot scanning
  const resolvedNodes = resolveChildren(children);

  // Scan for structural slots
  const { slots } = scanSlots(resolvedNodes);
  const triggerEntry = slots.get('tooltip-trigger')?.[0];
  const contentEntry = slots.get('tooltip-content')?.[0];

  // Create the low-level tooltip primitive
  const tooltip = Tooltip.Root({ delay });

  // Apply content class
  const contentInstanceClass = contentEntry?.attrs.class;
  const contentClassCombined = [classes?.content, contentInstanceClass].filter(Boolean).join(' ');
  if (contentClassCombined) {
    tooltip.content.className = contentClassCombined;
  }

  // Move trigger children into the tooltip's trigger element
  if (triggerEntry) {
    for (const node of triggerEntry.children) {
      tooltip.trigger.appendChild(node);
    }
  }

  // Move content children into the tooltip's content element
  if (contentEntry) {
    for (const node of contentEntry.children) {
      tooltip.content.appendChild(node);
    }
  }

  return (
    <div style="display: contents">
      {tooltip.trigger}
      {tooltip.content}
    </div>
  ) as HTMLDivElement;
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
