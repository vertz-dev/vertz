/**
 * Composed Accordion — compound component with expand/collapse and keyboard nav.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * Item provides per-item context for Trigger and Content.
 * No registration, no resolveChildren, no internal API imports.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
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
  classes?: AccordionClasses;
  /** Check if a value is open. Function to avoid eager signal reads. */
  isOpen: (value: string) => boolean;
  toggle: (value: string) => void;
}

interface AccordionItemContextValue {
  value: string;
  triggerId: string;
  contentId: string;
  classes?: AccordionClasses;
  /** Check if THIS item is open. Function to avoid eager signal reads. */
  isOpen: () => boolean;
  toggle: () => void;
  /** @internal Register the content element for imperative animation control. */
  _registerContentEl: (el: HTMLElement) => void;
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

  // Generate IDs once — these are stable for the lifetime of the component.
  const baseId = uniqueId('accordion');
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;

  // Mutable ref for the content element, set by AccordionContent via _registerContentEl.
  let contentEl: HTMLElement | null = null;

  const itemCtx: AccordionItemContextValue = {
    value,
    triggerId,
    contentId,
    classes: ctx.classes,
    isOpen: () => ctx.isOpen(value),
    toggle: () => {
      ctx.toggle(value);
      const nowOpen = ctx.isOpen(value);

      if (contentEl) {
        if (nowOpen) {
          setHidden(contentEl, false);
        }
        const height = contentEl.scrollHeight;
        contentEl.style.setProperty('--accordion-content-height', `${height}px`);
        setDataState(contentEl, nowOpen ? 'open' : 'closed');
        if (!nowOpen) {
          setHiddenAnimated(contentEl, true);
        }
      }

      // Update trigger attributes
      const triggerEl = document.getElementById(triggerId);
      if (triggerEl) {
        setExpanded(triggerEl, nowOpen);
        setDataState(triggerEl, nowOpen ? 'open' : 'closed');
      }
    },
    _registerContentEl: (el: HTMLElement) => {
      contentEl = el;
    },
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
  // Use useContext() directly so the compiler recognizes ctx as reactive.
  const ctx = useContext(AccordionItemContext);
  if (!ctx) {
    throw new Error(
      '<Accordion.Trigger> must be used inside <Accordion.Item>. ' +
        'Ensure it is a direct or nested child of an Accordion Item component.',
    );
  }
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.trigger, effectiveCls].filter(Boolean).join(' ');
  const initiallyOpen = ctx.isOpen();

  return (
    <button
      type="button"
      id={ctx.triggerId}
      data-accordion-trigger=""
      aria-controls={ctx.contentId}
      data-value={ctx.value}
      aria-expanded={initiallyOpen ? 'true' : 'false'}
      data-state={initiallyOpen ? 'open' : 'closed'}
      class={combined || undefined}
      onClick={() => ctx.toggle()}
    >
      {children}
    </button>
  );
}

function AccordionContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useContext(AccordionItemContext);
  if (!ctx) {
    throw new Error(
      '<Accordion.Content> must be used inside <Accordion.Item>. ' +
        'Ensure it is a direct or nested child of an Accordion Item component.',
    );
  }
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.content, effectiveCls].filter(Boolean).join(' ');
  const initiallyOpen = ctx.isOpen();

  const el = (
    <div
      role="region"
      id={ctx.contentId}
      data-accordion-content=""
      aria-labelledby={ctx.triggerId}
      aria-hidden={initiallyOpen ? 'false' : 'true'}
      data-state={initiallyOpen ? 'open' : 'closed'}
      style={initiallyOpen ? '' : 'display: none'}
      class={combined || undefined}
    >
      {children}
    </div>
  ) as HTMLElement;

  ctx._registerContentEl(el);

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
  defaultValue = [],
  onValueChange,
}: ComposedAccordionProps) {
  const multiple = type === 'multiple';

  let openValues: string[] = [...defaultValue];

  // Inline arrow functions in ctx so the compiler traces openValues → ctx → JSX
  // and transforms openValues to a signal. Function declarations are invisible
  // to the compiler's taint analysis.
  const ctx: AccordionContextValue = {
    classes,
    isOpen: (value: string) => openValues.includes(value),
    toggle: (value: string) => {
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
    },
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
