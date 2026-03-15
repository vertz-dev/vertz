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

function TooltipTrigger({ children }: SlotProps): HTMLElement {
  const el = document.createElement('span');
  el.dataset.slot = 'tooltip-trigger';
  el.style.display = 'contents';
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function TooltipContent({ children, class: cls }: SlotProps): HTMLElement {
  const el = document.createElement('div');
  el.dataset.slot = 'tooltip-content';
  el.style.display = 'contents';
  if (cls) el.dataset.class = cls;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
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

function ComposedTooltipRoot({
  children,
  classes,
  delay,
}: ComposedTooltipProps): HTMLElement {
  // Resolve children
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

  // Wrap trigger and content in a container
  const wrapper = document.createElement('div');
  wrapper.style.display = 'contents';
  wrapper.appendChild(tooltip.trigger);
  wrapper.appendChild(tooltip.content);

  return wrapper;
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedTooltip: ((props: ComposedTooltipProps) => HTMLElement) & {
  __classKeys?: TooltipClassKey;
  Trigger: typeof TooltipTrigger;
  Content: typeof TooltipContent;
} = Object.assign(ComposedTooltipRoot, {
  Trigger: TooltipTrigger,
  Content: TooltipContent,
});
