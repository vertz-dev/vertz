import type {
  ToggleGroupElements,
  ToggleGroupOptions,
  ToggleGroupState,
} from '@vertz/ui-primitives';
import { ToggleGroup } from '@vertz/ui-primitives';

interface ToggleGroupStyleClasses {
  readonly root: string;
  readonly item: string;
}

export function createThemedToggleGroup(styles: ToggleGroupStyleClasses): (
  options?: ToggleGroupOptions,
) => ToggleGroupElements & {
  state: ToggleGroupState;
  Item: (value: string) => HTMLButtonElement;
} {
  return function themedToggleGroup(options?: ToggleGroupOptions) {
    const result = ToggleGroup.Root(options);
    result.root.classList.add(styles.root);

    const originalItem = result.Item;
    result.Item = (value: string) => {
      const item = originalItem(value);
      item.classList.add(styles.item);
      return item;
    };

    return result;
  };
}
