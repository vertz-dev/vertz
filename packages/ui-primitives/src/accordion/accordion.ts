/**
 * Accordion primitive - expandable sections with keyboard navigation.
 * Follows WAI-ARIA accordion pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import { uniqueId } from '../utils/id';
import { handleListNavigation, isKey, Keys } from '../utils/keyboard';

export interface AccordionOptions {
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

export const Accordion = {
  Root(options: AccordionOptions = {}): AccordionElements & {
    state: AccordionState;
    Item: (value: string) => {
      item: HTMLDivElement;
      trigger: HTMLButtonElement;
      content: HTMLDivElement;
    };
  } {
    const { multiple = false, defaultValue = [], onValueChange } = options;
    const state: AccordionState = { value: signal([...defaultValue]) };
    const triggers: HTMLButtonElement[] = [];
    // Track all items for cross-item state updates (single mode)
    const itemMap = new Map<string, { trigger: HTMLButtonElement; content: HTMLDivElement }>();

    const root = document.createElement('div');
    root.setAttribute('data-orientation', 'vertical');

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

      // Close items that were open but are no longer
      for (const v of prev) {
        if (!current.includes(v)) {
          updateItemState(v, false);
        }
      }
      // Open items that are newly opened
      for (const v of current) {
        if (!prev.includes(v)) {
          updateItemState(v, true);
        }
      }
    }

    root.addEventListener('keydown', (event) => {
      if (isKey(event, Keys.ArrowUp, Keys.ArrowDown, Keys.Home, Keys.End)) {
        handleListNavigation(event, triggers, { orientation: 'vertical' });
      }
    });

    function Item(value: string): {
      item: HTMLDivElement;
      trigger: HTMLButtonElement;
      content: HTMLDivElement;
    } {
      const baseId = uniqueId('accordion');
      const triggerId = `${baseId}-trigger`;
      const contentId = `${baseId}-content`;
      const isOpen = state.value.peek().includes(value);

      const item = document.createElement('div');
      item.setAttribute('data-value', value);

      const trigger = document.createElement('button');
      trigger.setAttribute('type', 'button');
      trigger.id = triggerId;
      trigger.setAttribute('aria-controls', contentId);
      trigger.setAttribute('data-value', value);
      setExpanded(trigger, isOpen);
      setDataState(trigger, isOpen ? 'open' : 'closed');

      const content = document.createElement('div');
      content.setAttribute('role', 'region');
      content.id = contentId;
      content.setAttribute('aria-labelledby', triggerId);
      setHidden(content, !isOpen);
      setDataState(content, isOpen ? 'open' : 'closed');

      trigger.addEventListener('click', () => {
        toggleItem(value);
      });

      // Register for cross-item updates
      itemMap.set(value, { trigger, content });

      triggers.push(trigger);
      item.appendChild(trigger);
      item.appendChild(content);
      root.appendChild(item);

      // Set initial height for items that start open
      if (isOpen) {
        requestAnimationFrame(() => {
          const height = content.scrollHeight;
          content.style.setProperty('--accordion-content-height', `${height}px`);
        });
      }

      return { item, trigger, content };
    }

    return { root, state, Item };
  },
};
