import type { AccordionElements, AccordionOptions, AccordionState } from '@vertz/ui-primitives';
import { Accordion } from '@vertz/ui-primitives';

interface AccordionStyleClasses {
  readonly item: string;
  readonly trigger: string;
  readonly content: string;
}

export interface ThemedAccordionResult extends AccordionElements {
  state: AccordionState;
  Item: (value: string) => {
    item: HTMLDivElement;
    trigger: HTMLButtonElement;
    content: HTMLDivElement;
  };
}

export function createThemedAccordion(
  styles: AccordionStyleClasses,
): (options?: AccordionOptions) => ThemedAccordionResult {
  return function themedAccordion(options?: AccordionOptions): ThemedAccordionResult {
    const result = Accordion.Root(options);
    const originalItem = result.Item;
    return {
      root: result.root,
      state: result.state,
      Item: (value: string) => {
        const item = originalItem(value);
        item.item.classList.add(styles.item);
        item.trigger.classList.add(styles.trigger);
        item.content.classList.add(styles.content);
        return item;
      },
    };
  };
}
