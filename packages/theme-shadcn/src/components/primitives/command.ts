import type { CommandElements, CommandOptions, CommandState } from '@vertz/ui-primitives';
import { Command } from '@vertz/ui-primitives';

interface CommandStyleClasses {
  readonly root: string;
  readonly input: string;
  readonly list: string;
  readonly item: string;
  readonly group: string;
  readonly groupHeading: string;
  readonly separator: string;
  readonly empty: string;
}

interface ThemedCommandResult extends CommandElements {
  state: CommandState;
  Item: (value: string, label?: string, keywords?: string[]) => HTMLDivElement;
  Group: (label: string) => {
    el: HTMLDivElement;
    Item: (value: string, label?: string, keywords?: string[]) => HTMLDivElement;
  };
  Separator: () => HTMLHRElement;
}

export function createThemedCommand(
  styles: CommandStyleClasses,
): (options?: CommandOptions) => ThemedCommandResult {
  return function themedCommand(options?: CommandOptions) {
    const result = Command.Root(options);
    result.root.classList.add(styles.root);
    result.input.classList.add(styles.input);
    result.list.classList.add(styles.list);
    result.empty.classList.add(styles.empty);

    const originalItem = result.Item;
    const originalGroup = result.Group;
    const originalSeparator = result.Separator;

    result.Item = (value: string, label?: string, keywords?: string[]) => {
      const item = originalItem(value, label, keywords);
      item.classList.add(styles.item);
      return item;
    };

    result.Group = (label: string) => {
      const group = originalGroup(label);
      group.el.classList.add(styles.group);

      const labelId = group.el.getAttribute('aria-labelledby') ?? '';
      const heading = group.el.querySelector(`#${labelId}`);
      if (heading) {
        heading.classList.add(styles.groupHeading);
      }

      const originalGroupItem = group.Item;
      group.Item = (value: string, itemLabel?: string, keywords?: string[]) => {
        const item = originalGroupItem(value, itemLabel, keywords);
        item.classList.add(styles.item);
        return item;
      };

      return group;
    };

    result.Separator = () => {
      const sep = originalSeparator();
      sep.classList.add(styles.separator);
      return sep;
    };

    return result;
  };
}
