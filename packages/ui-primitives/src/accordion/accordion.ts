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

    const root = document.createElement('div');
    root.setAttribute('data-orientation', 'vertical');

    function toggleItem(value: string): void {
      const current = [...state.value.peek()];
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
        const nowOpen = state.value.peek().includes(value);
        // Measure content height for accordion animation
        const height = content.scrollHeight;
        content.style.setProperty('--accordion-content-height', `${height}px`);
        setExpanded(trigger, nowOpen);
        setDataState(trigger, nowOpen ? 'open' : 'closed');
        setDataState(content, nowOpen ? 'open' : 'closed');
        if (nowOpen) {
          setHidden(content, false);
        } else {
          // Defer display:none until exit animations complete
          setHiddenAnimated(content, true);
        }
      });

      triggers.push(trigger);
      item.appendChild(trigger);
      item.appendChild(content);
      root.appendChild(item);

      return { item, trigger, content };
    }

    return { root, state, Item };
  },
};
