import type {
  NavigationMenuElements,
  NavigationMenuOptions,
  NavigationMenuState,
} from '@vertz/ui-primitives';
import { NavigationMenu } from '@vertz/ui-primitives';

interface NavigationMenuStyleClasses {
  readonly root: string;
  readonly list: string;
  readonly trigger: string;
  readonly content: string;
  readonly link: string;
  readonly viewport: string;
}

export interface ThemedNavigationMenuResult extends NavigationMenuElements {
  state: NavigationMenuState;
  Item: (value: string, label?: string) => { trigger: HTMLButtonElement; content: HTMLDivElement };
  Link: (href: string, label: string) => HTMLAnchorElement;
}

export function createThemedNavigationMenu(
  styles: NavigationMenuStyleClasses,
): (options?: NavigationMenuOptions) => ThemedNavigationMenuResult {
  return function themedNavigationMenu(
    options?: NavigationMenuOptions,
  ): ThemedNavigationMenuResult {
    const result = NavigationMenu.Root(options);
    const originalItem = result.Item;
    const originalLink = result.Link;

    result.root.classList.add(styles.root);
    result.list.classList.add(styles.list);
    result.viewport.classList.add(styles.viewport);

    return {
      root: result.root,
      list: result.list,
      viewport: result.viewport,
      state: result.state,
      Item: (value: string, label?: string) => {
        const item = originalItem(value, label);
        item.trigger.classList.add(styles.trigger);
        item.content.classList.add(styles.content);
        return item;
      },
      Link: (href: string, label: string) => {
        const link = originalLink(href, label);
        link.classList.add(styles.link);
        return link;
      },
    };
  };
}
