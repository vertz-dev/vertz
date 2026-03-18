/**
 * Composed Accordion — compound component with expand/collapse and keyboard nav.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * Item provides per-item context for Trigger and Content.
 * No registration, no resolveChildren, no internal API imports.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';
import { uniqueId } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

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
  openValues: string[];
  classes?: AccordionClasses;
  toggle: (value: string) => void;
}

interface AccordionItemContextValue {
  value: string;
  triggerId: string;
  contentId: string;
  isOpen: boolean;
  classes?: AccordionClasses;
  toggle: () => void;
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
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function AccordionItem({ value, children }: ItemProps) {
  const ctx = useAccordionContext('Item');

  const baseId = uniqueId('accordion');
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;

  const itemCtx: AccordionItemContextValue = {
    value,
    triggerId,
    contentId,
    isOpen: ctx.openValues.includes(value),
    classes: ctx.classes,
    toggle: () => ctx.toggle(value),
  };

  return (
    <AccordionItemContext.Provider value={itemCtx}>
      <div data-accordion-item="" data-value={value} class={ctx.classes?.item}>
        {children}
      </div>
    </AccordionItemContext.Provider>
  );
}

function AccordionTrigger({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useAccordionItemContext('Trigger');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.trigger, effectiveCls].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      id={ctx.triggerId}
      data-accordion-trigger=""
      aria-controls={ctx.contentId}
      data-value={ctx.value}
      aria-expanded={ctx.isOpen ? 'true' : 'false'}
      data-state={ctx.isOpen ? 'open' : 'closed'}
      class={combined || undefined}
      onClick={() => ctx.toggle()}
    >
      {children}
    </button>
  );
}

function AccordionContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useAccordionItemContext('Content');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.content, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      role="region"
      id={ctx.contentId}
      data-accordion-content=""
      aria-labelledby={ctx.triggerId}
      aria-hidden={ctx.isOpen ? 'false' : 'true'}
      data-state={ctx.isOpen ? 'open' : 'closed'}
      style={ctx.isOpen ? '' : 'display: none'}
      class={combined || undefined}
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
  defaultValue = [],
  onValueChange,
}: ComposedAccordionProps) {
  const multiple = type === 'multiple';

  let openValues: string[] = [...defaultValue];

  function toggle(value: string): void {
    const current = [...openValues];
    const idx = current.indexOf(value);

    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      if (multiple) {
        current.push(value);
      } else {
        current.length = 0;
        current.push(value);
      }
    }

    openValues = current;
    onValueChange?.(current);
  }

  const ctx: AccordionContextValue = {
    openValues,
    classes,
    toggle,
  };

  return (
    <AccordionContext.Provider value={ctx}>
      <div
        data-orientation="vertical"
        data-accordion-root=""
        onKeydown={(event: KeyboardEvent) => {
          if (isKey(event, Keys.ArrowUp, Keys.ArrowDown, Keys.Home, Keys.End)) {
            const root = event.currentTarget as HTMLElement;
            const triggers = [...root.querySelectorAll<HTMLElement>('[data-accordion-trigger]')];
            handleListNavigation(event, triggers, { orientation: 'vertical' });
          }
        }}
      >
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export
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
