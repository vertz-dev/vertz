import type { MenubarElements, MenubarOptions, MenubarState } from '@vertz/ui-primitives';
import { Menubar } from '@vertz/ui-primitives';

interface MenubarStyleClasses {
  readonly root: string;
  readonly trigger: string;
  readonly content: string;
  readonly item: string;
  readonly separator: string;
  readonly label: string;
}

export interface ThemedMenubarResult extends MenubarElements {
  state: MenubarState;
  Menu: (
    value: string,
    label?: string,
  ) => {
    trigger: HTMLButtonElement;
    content: HTMLDivElement;
    Item: (value: string, label?: string) => HTMLDivElement;
    Group: (label: string) => {
      el: HTMLDivElement;
      Item: (value: string, label?: string) => HTMLDivElement;
    };
    Separator: () => HTMLHRElement;
  };
}

export function createThemedMenubar(
  styles: MenubarStyleClasses,
): (options?: MenubarOptions) => ThemedMenubarResult {
  return function themedMenubar(options?: MenubarOptions): ThemedMenubarResult {
    const result = Menubar.Root(options);
    result.root.classList.add(styles.root);

    function themedMenu(
      value: string,
      label?: string,
    ): {
      trigger: HTMLButtonElement;
      content: HTMLDivElement;
      Item: (value: string, label?: string) => HTMLDivElement;
      Group: (label: string) => {
        el: HTMLDivElement;
        Item: (value: string, label?: string) => HTMLDivElement;
      };
      Separator: () => HTMLHRElement;
    } {
      const menu = result.Menu(value, label);
      menu.trigger.classList.add(styles.trigger);
      menu.content.classList.add(styles.content);

      return {
        trigger: menu.trigger,
        content: menu.content,
        Item: (val: string, itemLabel?: string) => {
          const item = menu.Item(val, itemLabel);
          item.classList.add(styles.item);
          return item;
        },
        Group: (groupLabel: string) => {
          const group = menu.Group(groupLabel);
          return {
            el: group.el,
            Item: (val: string, itemLabel?: string) => {
              const item = group.Item(val, itemLabel);
              item.classList.add(styles.item);
              return item;
            },
          };
        },
        Separator: () => {
          const sep = menu.Separator();
          sep.classList.add(styles.separator);
          return sep;
        },
      };
    }

    return {
      root: result.root,
      state: result.state,
      Menu: themedMenu,
    };
  };
}
