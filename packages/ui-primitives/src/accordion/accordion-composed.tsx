/**
 * Composed Accordion — high-level composable component built on Accordion.Root.
 * Sub-components self-wire via context. No slot scanning.
 * Uses nested contexts: AccordionContext for the root, AccordionItemContext for each item.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
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
// Contexts
// ---------------------------------------------------------------------------

interface AccordionContextValue {
  accordion: ReturnType<typeof Accordion.Root>;
  classes?: AccordionClasses;
}

interface AccordionItemContextValue {
  trigger: HTMLButtonElement;
  content: HTMLDivElement;
  classes?: AccordionClasses;
}

const AccordionContext = createContext<AccordionContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::AccordionContext',
);

const AccordionItemContext = createContext<AccordionItemContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::AccordionItemContext',
);

function useAccordionContext(componentName: string): AccordionContextValue {
  const ctx = useContext(AccordionContext);
  if (!ctx) {
    throw new Error(
      `<Accordion.${componentName}> must be used inside <Accordion>. ` +
        'Ensure it is a direct or nested child of the Accordion root component.',
    );
  }
  return ctx;
}

function useAccordionItemContext(componentName: string): AccordionItemContextValue {
  const ctx = useContext(AccordionItemContext);
  if (!ctx) {
    throw new Error(
      `<Accordion.${componentName}> must be used inside <Accordion.Item>. ` +
        'Ensure it is a direct or nested child of an Accordion Item component.',
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

interface ItemProps extends SlotProps {
  value: string;
}

// ---------------------------------------------------------------------------
// Sub-components — self-wiring via context
// ---------------------------------------------------------------------------

function AccordionItem({ value, children }: ItemProps) {
  const { accordion, classes } = useAccordionContext('Item');
  const { item, trigger, content } = accordion.Item(value);

  // Apply item class
  if (classes?.item) item.className = classes.item;

  // Provide item context for Trigger and Content sub-components
  AccordionItemContext.Provider({ trigger, content, classes }, () => {
    resolveChildren(children);
  });

  return item;
}

function AccordionTrigger({ children, className: cls, class: classProp }: SlotProps) {
  const { trigger, classes } = useAccordionItemContext('Trigger');
  const effectiveCls = cls ?? classProp;

  // Apply trigger class
  const triggerClass = [classes?.trigger, effectiveCls].filter(Boolean).join(' ');
  if (triggerClass) trigger.className = triggerClass;

  // Move children into the primitive trigger
  const resolved = resolveChildren(children);
  for (const node of resolved) {
    trigger.appendChild(node);
  }

  return trigger;
}

function AccordionContent({ children, className: cls, class: classProp }: SlotProps) {
  const { content, classes } = useAccordionItemContext('Content');
  const effectiveCls = cls ?? classProp;

  // Apply content class
  const contentClass = [classes?.content, effectiveCls].filter(Boolean).join(' ');
  if (contentClass) content.className = contentClass;

  // Move children into the primitive content
  const resolved = resolveChildren(children);
  for (const node of resolved) {
    content.appendChild(node);
  }

  return content;
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
  const accordion = Accordion.Root({
    multiple: type === 'multiple',
    defaultValue,
    onValueChange,
  });

  const ctxValue: AccordionContextValue = {
    accordion,
    classes,
  };

  // Resolve children for registration side effects
  // Items call accordion.Item() which appends to accordion.root
  AccordionContext.Provider(ctxValue, () => {
    resolveChildren(children);
  });

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
