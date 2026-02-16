/**
 * Accordion primitive - expandable sections with keyboard navigation.
 * Follows WAI-ARIA accordion pattern.
 */
import type { Signal } from '@vertz/ui';
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
export declare const Accordion: {
  Root(options?: AccordionOptions): AccordionElements & {
    state: AccordionState;
    Item: (value: string) => {
      item: HTMLDivElement;
      trigger: HTMLButtonElement;
      content: HTMLDivElement;
    };
  };
};
//# sourceMappingURL=accordion.d.ts.map
