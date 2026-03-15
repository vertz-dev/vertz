/**
 * Composed Popover — high-level composable component built on Popover.Root.
 * Handles slot scanning, trigger wiring, ARIA sync, and class distribution.
 */

import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import { scanSlots } from '../composed/scan-slots';
import { Popover } from './popover';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface PopoverClasses {
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

function PopoverTrigger({ children }: SlotProps) {
  return (
    <span data-slot="popover-trigger" style="display: contents">
      {children}
    </span>
  );
}

function PopoverContent({ children, class: cls }: SlotProps) {
  return (
    <div data-slot="popover-content" data-class={cls || undefined} style="display: contents">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedPopoverProps {
  children?: ChildValue;
  classes?: PopoverClasses;
  onOpenChange?: (open: boolean) => void;
}

export type PopoverClassKey = keyof PopoverClasses;

function ComposedPopoverRoot({ children, classes, onOpenChange }: ComposedPopoverProps) {
  // Resolve children for slot scanning
  const resolvedNodes = resolveChildren(children);

  // Scan for structural slots
  const { slots } = scanSlots(resolvedNodes);
  const triggerEntry = slots.get('popover-trigger')?.[0];
  const contentEntry = slots.get('popover-content')?.[0];

  // Extract user trigger element
  const userTrigger = triggerEntry
    ? ((triggerEntry.element.firstElementChild as HTMLElement) ?? triggerEntry.element)
    : null;

  // Create the low-level popover primitive with ARIA sync
  const popover = Popover.Root({
    onOpenChange: (isOpen) => {
      if (userTrigger) {
        userTrigger.setAttribute('aria-expanded', String(isOpen));
        userTrigger.setAttribute('data-state', isOpen ? 'open' : 'closed');
      }
      onOpenChange?.(isOpen);
    },
  });

  // Apply content class
  const contentInstanceClass = contentEntry?.attrs.class;
  const contentClassCombined = [classes?.content, contentInstanceClass].filter(Boolean).join(' ');
  if (contentClassCombined) {
    popover.content.className = contentClassCombined;
  }

  // Wire the user's trigger
  if (userTrigger) {
    userTrigger.setAttribute('aria-haspopup', 'dialog');
    userTrigger.setAttribute('aria-controls', popover.content.id);
    userTrigger.setAttribute('aria-expanded', 'false');
    userTrigger.setAttribute('data-state', 'closed');

    userTrigger.addEventListener('click', () => {
      popover.trigger.click();
    });
  }

  // Move content children into the popover's dialog
  if (contentEntry) {
    for (const node of contentEntry.children) {
      popover.content.appendChild(node);
    }
  }

  return (
    <div style="display: contents">
      {userTrigger}
      {popover.content}
    </div>
  ) as HTMLElement;
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedPopover = Object.assign(ComposedPopoverRoot, {
  Trigger: PopoverTrigger,
  Content: PopoverContent,
}) as ((props: ComposedPopoverProps) => HTMLElement) & {
  __classKeys?: PopoverClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
};
