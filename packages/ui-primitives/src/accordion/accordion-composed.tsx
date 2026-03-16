/**
 * Composed Accordion — high-level composable component built on Accordion.Root.
 * Handles slot scanning, trigger/content wiring, and class distribution.
 */

import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import { scanSlots } from '../composed/scan-slots';
import { Accordion } from './accordion';

// ---------------------------------------------------------------------------
// Class types
// ---------------------------------------------------------------------------

export interface AccordionClasses {
  item?: string;
  trigger?: string;
  content?: string;
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

interface ItemProps extends SlotProps {
  value: string;
}

// ---------------------------------------------------------------------------
// Sub-components — structural slot markers
// ---------------------------------------------------------------------------

function AccordionItem({ value, children }: ItemProps) {
  return (
    <div data-slot="accordion-item" data-value={value} style="display: contents">
      {children}
    </div>
  );
}

function AccordionTrigger({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  return (
    <span
      data-slot="accordion-trigger"
      data-class={effectiveCls || undefined}
      style="display: contents"
    >
      {children}
    </span>
  );
}

function AccordionContent({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  return (
    <div
      data-slot="accordion-content"
      data-class={effectiveCls || undefined}
      style="display: contents"
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedAccordionProps {
  children?: ChildValue;
  classes?: AccordionClasses;
  type?: 'single' | 'multiple';
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
}

export type AccordionClassKey = keyof AccordionClasses;

function ComposedAccordionRoot({
  children,
  classes,
  type,
  defaultValue,
  onValueChange,
}: ComposedAccordionProps) {
  // Resolve children to scan for structural slots
  const resolvedNodes = resolveChildren(children);

  // Scan for item slots
  const { slots } = scanSlots(resolvedNodes);
  const itemEntries = slots.get('accordion-item') ?? [];

  // Create the low-level accordion primitive
  const accordion = Accordion.Root({
    multiple: type === 'multiple',
    defaultValue,
    onValueChange,
  });

  // Process each accordion item
  for (const itemEntry of itemEntries) {
    const value = itemEntry.attrs.value;
    if (!value) continue;

    const { item, trigger, content } = accordion.Item(value);

    // Apply item class
    if (classes?.item) item.className = classes.item;

    // Scan item's children for trigger and content sub-slots
    const itemChildren = itemEntry.children.filter(
      (n): n is HTMLElement => n instanceof HTMLElement,
    );
    const itemSlots = scanSlots(itemChildren);

    // Process trigger
    const triggerEntry = itemSlots.slots.get('accordion-trigger')?.[0];
    if (triggerEntry) {
      const triggerClass = [classes?.trigger, triggerEntry.attrs.class].filter(Boolean).join(' ');
      if (triggerClass) trigger.className = triggerClass;

      // Move trigger children into the primitive trigger
      for (const node of triggerEntry.children) {
        trigger.appendChild(node);
      }
    }

    // Process content
    const contentEntry = itemSlots.slots.get('accordion-content')?.[0];
    if (contentEntry) {
      const contentClass = [classes?.content, contentEntry.attrs.class].filter(Boolean).join(' ');
      if (contentClass) content.className = contentClass;

      // Move content children into the primitive content
      for (const node of contentEntry.children) {
        content.appendChild(node);
      }
    }
  }

  return accordion.root;
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedAccordion = Object.assign(ComposedAccordionRoot, {
  Item: AccordionItem,
  Trigger: AccordionTrigger,
  Content: AccordionContent,
}) as ((props: ComposedAccordionProps) => HTMLElement) & {
  __classKeys?: AccordionClassKey;
  Item: (props: ItemProps) => HTMLElement;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
};
