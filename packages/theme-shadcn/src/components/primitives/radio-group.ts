import type { RadioElements, RadioOptions, RadioState } from '@vertz/ui-primitives';
import { Radio } from '@vertz/ui-primitives';

interface RadioGroupStyleClasses {
  readonly root: string;
  readonly item: string;
}

export interface ThemedRadioGroupResult extends RadioElements {
  state: RadioState;
  Item: (value: string, label?: string) => HTMLDivElement;
}

export function createThemedRadioGroup(
  styles: RadioGroupStyleClasses,
): (options?: RadioOptions) => ThemedRadioGroupResult {
  return function themedRadioGroup(options?: RadioOptions): ThemedRadioGroupResult {
    const result = Radio.Root(options);
    result.root.classList.add(styles.root);
    const originalItem = result.Item;

    return {
      root: result.root,
      state: result.state,
      Item: (value: string, label?: string) => {
        const item = originalItem(value, label);
        item.classList.add(styles.item);
        return item;
      },
    };
  };
}
