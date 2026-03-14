/**
 * Composed Accordion — high-level composable component built on Accordion.Root.
 * Handles slot scanning, trigger/content wiring, and class distribution via context.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren } from '@vertz/ui';
import { scanSlots } from '../composed/scan-slots';
import { Accordion } from './accordion';

// ---------------------------------------------------------------------------
// Class distribution context
// ---------------------------------------------------------------------------

export interface AccordionClasses {
  item?: string;
  trigger?: string;
  content?: string;
}

const AccordionClassesContext = createContext<AccordionClasses | undefined>(
  undefined,
  '@vertz/ui-primitives::AccordionClassesContext',
);

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface SlotProps {
  children?: ChildValue;
  class?: string;
}

interface ItemProps extends SlotProps {
  value: string;
}

// ---------------------------------------------------------------------------
// Sub-components — structural slot markers
// ---------------------------------------------------------------------------

function AccordionItem({ value, children }: ItemProps): HTMLElement {
  const el = document.createElement('div');
  el.dataset.slot = 'accordion-item';
  el.dataset.value = value;
  el.style.display = 'contents';
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function AccordionTrigger({ children, class: cls }: SlotProps): HTMLElement {
  const el = document.createElement('span');
  el.dataset.slot = 'accordion-trigger';
  el.style.display = 'contents';
  if (cls) el.dataset.class = cls;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function AccordionContent({ children, class: cls }: SlotProps): HTMLElement {
  const el = document.createElement('div');
  el.dataset.slot = 'accordion-content';
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
}: ComposedAccordionProps): HTMLElement {
  // Provide classes via context, then resolve children inside the scope
  let resolvedNodes: Node[];
  AccordionClassesContext.Provider(classes, () => {
    resolvedNodes = resolveChildren(children);
  });

  // Scan for item slots
  const { slots } = scanSlots(resolvedNodes!);
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

export const ComposedAccordion: ((props: ComposedAccordionProps) => HTMLElement) & {
  __classKeys?: AccordionClassKey;
  Item: typeof AccordionItem;
  Trigger: typeof AccordionTrigger;
  Content: typeof AccordionContent;
} = Object.assign(ComposedAccordionRoot, {
  Item: AccordionItem,
  Trigger: AccordionTrigger,
  Content: AccordionContent,
});
