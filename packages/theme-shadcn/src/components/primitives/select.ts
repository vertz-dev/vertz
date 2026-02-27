import type { SelectElements, SelectOptions, SelectState } from '@vertz/ui-primitives';
import { Select } from '@vertz/ui-primitives';

interface SelectStyleClasses {
  readonly trigger: string;
  readonly content: string;
  readonly item: string;
}

export interface ThemedSelectResult extends SelectElements {
  state: SelectState;
  Item: (value: string, label?: string) => HTMLDivElement;
}

export function createThemedSelect(
  styles: SelectStyleClasses,
): (options?: SelectOptions) => ThemedSelectResult {
  return function themedSelect(options?: SelectOptions): ThemedSelectResult {
    const result = Select.Root(options);
    const originalItem = result.Item;
    result.trigger.classList.add(styles.trigger);
    result.content.classList.add(styles.content);
    return {
      trigger: result.trigger,
      content: result.content,
      state: result.state,
      Item: (value: string, label?: string) => {
        const item = originalItem(value, label);
        item.classList.add(styles.item);
        return item;
      },
    };
  };
}
