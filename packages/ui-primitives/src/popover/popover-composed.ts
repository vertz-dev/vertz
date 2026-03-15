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

function PopoverTrigger({ children }: SlotProps): HTMLElement {
  const el = document.createElement('span');
  el.dataset.slot = 'popover-trigger';
  el.style.display = 'contents';
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function PopoverContent({ children, class: cls }: SlotProps): HTMLElement {
  const el = document.createElement('div');
  el.dataset.slot = 'popover-content';
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

export interface ComposedPopoverProps {
  children?: ChildValue;
  classes?: PopoverClasses;
  onOpenChange?: (open: boolean) => void;
}

export type PopoverClassKey = keyof PopoverClasses;

function ComposedPopoverRoot({
  children,
  classes,
  onOpenChange,
}: ComposedPopoverProps): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'contents';

  // Resolve children
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

    wrapper.appendChild(userTrigger);
  }

  // Move content children into the popover's dialog
  if (contentEntry) {
    for (const node of contentEntry.children) {
      popover.content.appendChild(node);
    }
  }

  wrapper.appendChild(popover.content);

  return wrapper;
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedPopover: ((props: ComposedPopoverProps) => HTMLElement) & {
  __classKeys?: PopoverClassKey;
  Trigger: typeof PopoverTrigger;
  Content: typeof PopoverContent;
} = Object.assign(ComposedPopoverRoot, {
  Trigger: PopoverTrigger,
  Content: PopoverContent,
});
