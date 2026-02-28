import type { MenuElements, MenuOptions, MenuState } from '@vertz/ui-primitives';
import { Menu } from '@vertz/ui-primitives';

let idCounter = 0;

interface DropdownMenuStyleClasses {
  readonly content: string;
  readonly item: string;
  readonly group: string;
  readonly label: string;
  readonly separator: string;
}

export interface ThemedDropdownMenuResult extends MenuElements {
  state: MenuState;
  Item: (value: string, label?: string) => HTMLDivElement;
  Group: (label: string) => {
    el: HTMLDivElement;
    Item: (value: string, label?: string) => HTMLDivElement;
  };
  Separator: () => HTMLHRElement;
  Label: (text: string) => HTMLDivElement;
}

export function createThemedDropdownMenu(
  styles: DropdownMenuStyleClasses,
): (options?: MenuOptions) => ThemedDropdownMenuResult {
  return function themedDropdownMenu(options?: MenuOptions): ThemedDropdownMenuResult {
    const result = Menu.Root(options);
    result.content.classList.add(styles.content);

    function themedItem(value: string, label?: string): HTMLDivElement {
      const item = result.Item(value, label);
      item.classList.add(styles.item);
      return item;
    }

    return {
      trigger: result.trigger,
      content: result.content,
      state: result.state,
      Item: themedItem,
      Group: (label: string) => {
        const group = result.Group(label);
        group.el.classList.add(styles.group);
        const labelEl = document.createElement('div');
        labelEl.id = `menu-group-label-${++idCounter}`;
        labelEl.textContent = label;
        labelEl.classList.add(styles.label);
        group.el.removeAttribute('aria-label');
        group.el.setAttribute('aria-labelledby', labelEl.id);
        group.el.prepend(labelEl);
        return {
          el: group.el,
          Item: (value: string, itemLabel?: string) => {
            const item = group.Item(value, itemLabel);
            item.classList.add(styles.item);
            return item;
          },
        };
      },
      Separator: () => {
        const sep = result.Separator();
        sep.classList.add(styles.separator);
        return sep;
      },
      Label: (text: string) => {
        const el = result.Label(text);
        el.classList.add(styles.label);
        return el;
      },
    };
  };
}
