/**
 * Composed Accordion — compound component with expand/collapse and keyboard nav.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * Item provides per-item context for Trigger and Content.
 * No registration, no resolveChildren, no internal API imports.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, onMount, useContext } from '@vertz/ui';
import { setHiddenAnimated } from '../utils/aria';
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

  // Generate IDs once — these are stable for the lifetime of the component.
  const baseId = uniqueId('accordion');
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;

  // Use function references to avoid eager signal reads during component body.
  // The signal is only read when isOpen() is called in JSX attribute expressions,
  // which the compiler wraps in __attr effects.
  const itemCtx: AccordionItemContextValue = {
    value,
    triggerId,
    contentId,
    classes: ctx.classes,
    isOpen: () => ctx.isOpen(value),
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
      aria-expanded={ctx.isOpen() ? 'true' : 'false'}
      data-state={ctx.isOpen() ? 'open' : 'closed'}
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

  // Animate open/close on the connected DOM element.
  onMount(() => {
    const open = ctx.isOpen();
    const el = document.getElementById(ctx.contentId);
    if (!el) return;
    const height = el.scrollHeight;
    el.style.setProperty('--accordion-content-height', `${height}px`);
    el.setAttribute('data-state', open ? 'open' : 'closed');
    if (open) {
      el.setAttribute('aria-hidden', 'false');
      el.style.display = '';
    } else {
      setHiddenAnimated(el, true);
    }
  });

  return (
    <div
      role="region"
      id={ctx.contentId}
      data-accordion-content=""
      aria-labelledby={ctx.triggerId}
      aria-hidden="true"
      data-state="closed"
      style="display: none"
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

  function isOpen(value: string): boolean {
    return openValues.includes(value);
  }

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
    classes,
    isOpen,
    toggle,
  };

  // Wire click + keyboard handlers on the connected root via event delegation.
  onMount(() => {
    const root = document.querySelector('[data-accordion-root]') as HTMLElement & { __accRootWired?: boolean } | null;
    if (!root || root.__accRootWired) return;
    root.__accRootWired = true;

    root.addEventListener('click', (event: Event) => {
      const trigger = (event.target as HTMLElement).closest('[data-accordion-trigger]') as HTMLElement | null;
      if (!trigger) return;
      const value = trigger.getAttribute('data-value');
      if (!value) return;

      // Find the content region for this trigger
      const contentId = trigger.getAttribute('aria-controls');
      const content = contentId ? document.getElementById(contentId) : null;
      const wasOpen = trigger.getAttribute('aria-expanded') === 'true';

      // In single mode, close all other items first
      if (!multiple) {
        const allTriggers = root.querySelectorAll<HTMLElement>('[data-accordion-trigger]');
        allTriggers.forEach(t => {
          if (t === trigger) return;
          const cId = t.getAttribute('aria-controls');
          const c = cId ? document.getElementById(cId) : null;
          if (t.getAttribute('aria-expanded') === 'true') {
            t.setAttribute('aria-expanded', 'false');
            t.setAttribute('data-state', 'closed');
            if (c) setHiddenAnimated(c, true);
            if (c) c.setAttribute('data-state', 'closed');
          }
        });
      }

      // Toggle this item
      if (wasOpen) {
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('data-state', 'closed');
        if (content) {
          content.setAttribute('data-state', 'closed');
          setHiddenAnimated(content, true);
        }
      } else {
        trigger.setAttribute('aria-expanded', 'true');
        trigger.setAttribute('data-state', 'open');
        if (content) {
          content.setAttribute('aria-hidden', 'false');
          content.style.display = '';
          content.setAttribute('data-state', 'open');
          const height = content.scrollHeight;
          content.style.setProperty('--accordion-content-height', `${height}px`);
        }
      }

      // Sync signal for external consumers
      toggle(value);
    });

    root.addEventListener('keydown', (event: Event) => {
      const ke = event as KeyboardEvent;
      if (isKey(ke, Keys.ArrowUp, Keys.ArrowDown, Keys.Home, Keys.End)) {
        const triggers = [...root.querySelectorAll<HTMLElement>('[data-accordion-trigger]')];
        handleListNavigation(ke, triggers, { orientation: 'vertical' });
      }
    });
  });

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
