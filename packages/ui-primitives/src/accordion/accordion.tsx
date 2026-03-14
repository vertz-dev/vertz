/**
 * Accordion primitive - expandable sections with keyboard navigation.
 * Follows WAI-ARIA accordion pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { uniqueId } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

export interface AccordionOptions extends ElementAttrs {
  multiple?: boolean;
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
}

export interface AccordionState {
  value: Signal<string[]>;
}

export interface AccordionElements {
  root: HTMLDivElement;
}

function AccordionRoot(options: AccordionOptions = {}): AccordionElements & {
  state: AccordionState;
  Item: (value: string) => {
    item: HTMLDivElement;
    trigger: HTMLButtonElement;
    content: HTMLDivElement;
  };
} {
  const { multiple = false, defaultValue = [], onValueChange, ...attrs } = options;
  const state: AccordionState = { value: signal([...defaultValue]) };
  const triggers: HTMLButtonElement[] = [];
  const itemMap = new Map<string, { trigger: HTMLButtonElement; content: HTMLDivElement }>();

  function updateItemState(val: string, open: boolean): void {
    const entry = itemMap.get(val);
    if (!entry) return;
    const { trigger: t, content: c } = entry;
    if (open) {
      setHidden(c, false);
    }
    const height = c.scrollHeight;
    c.style.setProperty('--accordion-content-height', `${height}px`);
    setExpanded(t, open);
    setDataState(t, open ? 'open' : 'closed');
    setDataState(c, open ? 'open' : 'closed');
    if (!open) {
      setHiddenAnimated(c, true);
    }
  }

  function toggleItem(value: string): void {
    const prev = [...state.value.peek()];
    const current = [...prev];
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

    state.value.value = current;
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

  const root = (
    <div
      data-orientation="vertical"
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.ArrowUp, Keys.ArrowDown, Keys.Home, Keys.End)) {
          handleListNavigation(event, triggers, { orientation: 'vertical' });
        }
      }}
    />
  ) as HTMLDivElement;

  function Item(value: string): {
    item: HTMLDivElement;
    trigger: HTMLButtonElement;
    content: HTMLDivElement;
  } {
    const baseId = uniqueId('accordion');
    const triggerId = `${baseId}-trigger`;
    const contentId = `${baseId}-content`;
    const isOpen = state.value.peek().includes(value);

    const trigger = (
      <button
        type="button"
        id={triggerId}
        aria-controls={contentId}
        data-value={value}
        aria-expanded={isOpen ? 'true' : 'false'}
        data-state={isOpen ? 'open' : 'closed'}
        onClick={() => toggleItem(value)}
      />
    ) as HTMLButtonElement;

    const content = (
      <div
        role="region"
        id={contentId}
        aria-labelledby={triggerId}
        aria-hidden={isOpen ? 'false' : 'true'}
        data-state={isOpen ? 'open' : 'closed'}
        style={isOpen ? '' : 'display: none'}
      />
    ) as HTMLDivElement;

    const item = (
      <div data-value={value}>
        {trigger}
        {content}
      </div>
    ) as HTMLDivElement;

    itemMap.set(value, { trigger, content });
    triggers.push(trigger);
    root.appendChild(item);

    if (isOpen) {
      requestAnimationFrame(() => {
        const height = content.scrollHeight;
        content.style.setProperty('--accordion-content-height', `${height}px`);
      });
    }

    return { item, trigger, content };
  }

  applyAttrs(root, attrs);

  return { root, state, Item };
}

export const Accordion: {
  Root: (options?: AccordionOptions) => AccordionElements & {
    state: AccordionState;
    Item: (value: string) => {
      item: HTMLDivElement;
      trigger: HTMLButtonElement;
      content: HTMLDivElement;
    };
  };
} = {
  Root: AccordionRoot,
};
