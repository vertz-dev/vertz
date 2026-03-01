import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import { Accordion } from '@vertz/ui-primitives';

interface AccordionStyleClasses {
  readonly item: string;
  readonly trigger: string;
  readonly content: string;
}

// ── Props ──────────────────────────────────────────────────

export interface AccordionRootProps {
  type?: 'single' | 'multiple';
  defaultValue?: string[];
  children?: ChildValue;
}

export interface AccordionSlotProps {
  children?: ChildValue;
  class?: string;
}

export interface AccordionItemProps {
  value: string;
  children?: ChildValue;
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedAccordionComponent {
  (props: AccordionRootProps): HTMLDivElement;
  Item: (props: AccordionItemProps) => HTMLDivElement;
  Trigger: (props: AccordionSlotProps) => HTMLElement;
  Content: (props: AccordionSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedAccordion(styles: AccordionStyleClasses): ThemedAccordionComponent {
  // ── Sub-components (slot markers) ──

  function AccordionItem({
    value,
    children,
    class: className,
  }: AccordionItemProps): HTMLDivElement {
    const el = document.createElement('div');
    el.dataset.slot = 'accordion-item';
    el.dataset.value = value;
    el.style.display = 'contents';
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  function AccordionTrigger({ children, class: className }: AccordionSlotProps): HTMLElement {
    const el = document.createElement('span');
    el.dataset.slot = 'accordion-trigger';
    el.style.display = 'contents';
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  function AccordionContent({ children, class: className }: AccordionSlotProps): HTMLElement {
    const el = document.createElement('div');
    el.dataset.slot = 'accordion-content';
    el.style.display = 'contents';
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  // ── Root orchestrator ──

  function AccordionRoot({ type, defaultValue, children }: AccordionRootProps): HTMLDivElement {
    const result = Accordion.Root({
      multiple: type === 'multiple',
      defaultValue,
    });

    // Scan children for accordion-item slots
    for (const node of resolveChildren(children)) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.dataset.slot !== 'accordion-item') continue;

      const value = node.dataset.value;
      if (!value) continue;

      // Create the primitive item (handles header/trigger/content structure)
      const item = result.Item(value);

      // Apply theme styles
      item.item.classList.add(styles.item);
      item.trigger.classList.add(styles.trigger);
      item.content.classList.add(styles.content);

      // Inner padding wrapper (avoids conflict with height animation)
      const inner = document.createElement('div');
      inner.style.cssText = 'padding: 0.5rem 0.5rem 1rem;';

      // Scan item slot's children for trigger and content sub-slots
      for (const child of Array.from(node.childNodes)) {
        if (!(child instanceof HTMLElement)) continue;
        const slot = child.dataset.slot;

        if (slot === 'accordion-trigger') {
          // Move trigger sub-slot's child nodes into the primitive trigger
          for (const n of Array.from(child.childNodes)) {
            item.trigger.appendChild(n);
          }
        } else if (slot === 'accordion-content') {
          // Move content sub-slot's child nodes into the inner padding wrapper
          for (const n of Array.from(child.childNodes)) {
            inner.appendChild(n);
          }
        }
      }

      if (inner.childNodes.length > 0) item.content.appendChild(inner);
    }

    return result.root;
  }

  // Attach sub-components to Root
  AccordionRoot.Item = AccordionItem;
  AccordionRoot.Trigger = AccordionTrigger;
  AccordionRoot.Content = AccordionContent;

  return AccordionRoot as ThemedAccordionComponent;
}
