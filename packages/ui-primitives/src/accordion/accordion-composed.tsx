/**
 * Composed Accordion — fully declarative JSX component with expand/collapse and keyboard nav.
 * Sub-components self-wire via context. No factory wrapping.
 * Uses nested contexts: AccordionContext for the root, AccordionItemContext for each item.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
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
// Registration types
// ---------------------------------------------------------------------------

interface ItemRegistration {
  value: string;
  triggerId: string;
  contentId: string;
  triggerChildren: ChildValue;
  triggerClass: string | undefined;
  contentChildren: ChildValue;
  contentClass: string | undefined;
}

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

interface AccordionContextValue {
  classes?: AccordionClasses;
  /** @internal — registers a fully-resolved item */
  _registerItem: (reg: ItemRegistration) => void;
  /** @internal — duplicate detection */
  _itemsClaimed: Set<string>;
}

interface AccordionItemContextValue {
  value: string;
  triggerId: string;
  contentId: string;
  classes?: AccordionClasses;
  /** @internal — registers trigger children/class for the item */
  _registerTrigger: (children: ChildValue, cls?: string) => void;
  /** @internal — registers content children/class for the item */
  _registerContent: (children: ChildValue, cls?: string) => void;
  /** @internal — duplicate detection */
  _triggerClaimed: boolean;
  _contentClaimed: boolean;
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
// Sub-components — registration via context
// ---------------------------------------------------------------------------

function AccordionItem({ value, children }: ItemProps) {
  const ctx = useAccordionContext('Item');
  if (ctx._itemsClaimed.has(value)) {
    console.warn(`Duplicate <Accordion.Item value="${value}"> detected – only the first is used`);
  }
  ctx._itemsClaimed.add(value);

  // Generate stable IDs for this item's trigger/content
  const baseId = uniqueId('accordion');
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;

  // Registration storage for this item's trigger/content
  const itemReg: {
    triggerChildren: ChildValue;
    triggerClass: string | undefined;
    contentChildren: ChildValue;
    contentClass: string | undefined;
  } = {
    triggerChildren: undefined,
    triggerClass: undefined,
    contentChildren: undefined,
    contentClass: undefined,
  };

  const itemCtx: AccordionItemContextValue = {
    value,
    triggerId,
    contentId,
    classes: ctx.classes,
    _registerTrigger: (triggerChildren, triggerClass) => {
      if (itemReg.triggerChildren === undefined) {
        itemReg.triggerChildren = triggerChildren;
        itemReg.triggerClass = triggerClass;
      }
    },
    _registerContent: (contentChildren, contentClass) => {
      if (itemReg.contentChildren === undefined) {
        itemReg.contentChildren = contentChildren;
        itemReg.contentClass = contentClass;
      }
    },
    _triggerClaimed: false,
    _contentClaimed: false,
  };

  // Resolve children (Trigger, Content) to collect their registrations
  AccordionItemContext.Provider(itemCtx, () => {
    resolveChildren(children);
  });

  // Register the fully-resolved item with the root
  ctx._registerItem({
    value,
    triggerId,
    contentId,
    triggerChildren: itemReg.triggerChildren,
    triggerClass: itemReg.triggerClass,
    contentChildren: itemReg.contentChildren,
    contentClass: itemReg.contentClass,
  });

  // Return a placeholder — Root renders the real item element
  return (<span style="display: contents" />) as HTMLElement;
}

function AccordionTrigger({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useAccordionItemContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <Accordion.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;

  const effectiveCls = cls ?? classProp;
  ctx._registerTrigger(children, effectiveCls);

  // Return a placeholder — Root renders the real trigger button
  return (<span style="display: contents" />) as HTMLElement;
}

function AccordionContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useAccordionItemContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <Accordion.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;

  const effectiveCls = cls ?? classProp;
  ctx._registerContent(children, effectiveCls);

  // Return a placeholder — Root renders the real content element
  return (<span style="display: contents" />) as HTMLElement;
}

// ---------------------------------------------------------------------------
// Element builders — standalone functions outside the Root component body so
// the Vertz compiler does not classify their return values as computed().
// ---------------------------------------------------------------------------

function buildTriggerEl(
  item: ItemRegistration,
  classes: AccordionClasses | undefined,
  isOpen: boolean,
): HTMLButtonElement {
  const triggerClass = [classes?.trigger, item.triggerClass].filter(Boolean).join(' ');
  const resolved = resolveChildren(item.triggerChildren);
  return (
    <button
      type="button"
      id={item.triggerId}
      aria-controls={item.contentId}
      data-value={item.value}
      aria-expanded={isOpen ? 'true' : 'false'}
      data-state={isOpen ? 'open' : 'closed'}
      class={triggerClass || undefined}
    >
      {...resolved}
    </button>
  ) as HTMLButtonElement;
}

function buildContentEl(
  item: ItemRegistration,
  classes: AccordionClasses | undefined,
  isOpen: boolean,
): HTMLDivElement {
  const contentClass = [classes?.content, item.contentClass].filter(Boolean).join(' ');
  const resolved = resolveChildren(item.contentChildren);
  return (
    <div
      role="region"
      id={item.contentId}
      aria-labelledby={item.triggerId}
      aria-hidden={isOpen ? 'false' : 'true'}
      data-state={isOpen ? 'open' : 'closed'}
      style={isOpen ? '' : 'display: none'}
      class={contentClass || undefined}
    >
      {...resolved}
    </div>
  ) as HTMLDivElement;
}

function buildItemEl(
  item: ItemRegistration,
  classes: AccordionClasses | undefined,
  triggerEl: HTMLButtonElement,
  contentEl: HTMLDivElement,
): HTMLDivElement {
  const itemClass = classes?.item || undefined;
  return (
    <div data-value={item.value} class={itemClass}>
      {triggerEl}
      {contentEl}
    </div>
  ) as HTMLDivElement;
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

  // Registration storage — plain object so the compiler doesn't signal-transform it
  const reg: {
    items: ItemRegistration[];
    itemMap: Map<string, ItemRegistration>;
  } = { items: [], itemMap: new Map() };

  const ctxValue: AccordionContextValue = {
    classes,
    _registerItem: (itemReg) => {
      if (!reg.itemMap.has(itemReg.value)) {
        reg.items.push(itemReg);
        reg.itemMap.set(itemReg.value, itemReg);
      }
    },
    _itemsClaimed: new Set(),
  };

  // Phase 1: resolve children to collect item registrations
  AccordionContext.Provider(ctxValue, () => {
    resolveChildren(children);
  });

  // Phase 2: build trigger, content, and item elements.
  // Use plain arrays with a loop — the compiler only transforms top-level
  // `const` assignments; variables inside loop bodies are not analyzed.
  const triggerEls: HTMLButtonElement[] = [];
  const contentEls: HTMLDivElement[] = [];
  const itemEls: HTMLDivElement[] = [];

  for (const item of reg.items) {
    const isOpen = defaultValue.includes(item.value);
    const triggerEl = buildTriggerEl(item, classes, isOpen);
    const contentEl = buildContentEl(item, classes, isOpen);
    const itemEl = buildItemEl(item, classes, triggerEl, contentEl);
    triggerEls.push(triggerEl);
    contentEls.push(contentEl);
    itemEls.push(itemEl);
  }

  // let for reactive state — compiler transforms to signal
  let openValues: string[] = [...defaultValue];

  function updateItemState(value: string, open: boolean): void {
    const idx = reg.items.findIndex((item) => item.value === value);
    if (idx < 0) return;
    const triggerEl = triggerEls[idx]!;
    const contentEl = contentEls[idx]!;
    if (open) {
      setHidden(contentEl, false);
    }
    const height = contentEl.scrollHeight;
    contentEl.style.setProperty('--accordion-content-height', `${height}px`);
    setExpanded(triggerEl, open);
    setDataState(triggerEl, open ? 'open' : 'closed');
    setDataState(contentEl, open ? 'open' : 'closed');
    if (!open) {
      setHiddenAnimated(contentEl, true);
    }
  }

  function toggleItem(value: string): void {
    const prev = [...openValues];
    const current = [...prev];
    const itemIdx = current.indexOf(value);

    if (itemIdx >= 0) {
      current.splice(itemIdx, 1);
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

    for (const v of prev) {
      if (!current.includes(v)) {
        updateItemState(v, false);
      }
    }
    for (const v of current) {
      if (!prev.includes(v)) {
        updateItemState(v, true);
      }
    }
  }

  // Wire click handlers on each trigger (explicit for cleanup)
  for (let i = 0; i < triggerEls.length; i++) {
    const triggerEl = triggerEls[i]!;
    const itemValue = reg.items[i]!.value;
    const handleClick = () => toggleItem(itemValue);
    triggerEl.addEventListener('click', handleClick);
    _tryOnCleanup(() => triggerEl.removeEventListener('click', handleClick));
  }

  // Initialize open heights for initially-open items
  for (let i = 0; i < reg.items.length; i++) {
    const item = reg.items[i]!;
    if (defaultValue.includes(item.value)) {
      const contentEl = contentEls[i]!;
      requestAnimationFrame(() => {
        const height = contentEl.scrollHeight;
        contentEl.style.setProperty('--accordion-content-height', `${height}px`);
      });
    }
  }

  const handleKeydown = (event: KeyboardEvent) => {
    if (isKey(event, Keys.ArrowUp, Keys.ArrowDown, Keys.Home, Keys.End)) {
      handleListNavigation(event, triggerEls, { orientation: 'vertical' });
    }
  };

  return (
    <div data-orientation="vertical" onKeydown={handleKeydown}>
      {...itemEls}
    </div>
  );
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
