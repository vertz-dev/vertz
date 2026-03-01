/**
 * DropdownMenu primitive - button-triggered positioned menu.
 * Thin wrapper around Menu.Root() with default bottom-start positioning.
 */

import type { MenuElements, MenuOptions, MenuState } from '../menu/menu';
import { Menu } from '../menu/menu';

export interface DropdownMenuOptions extends MenuOptions {}

export interface DropdownMenuState extends MenuState {}

export interface DropdownMenuElements extends MenuElements {}

export const DropdownMenu = {
  Root(options: DropdownMenuOptions = {}): DropdownMenuElements & {
    state: DropdownMenuState;
    Item: (value: string, label?: string) => HTMLDivElement;
    Group: (label: string) => {
      el: HTMLDivElement;
      Item: (value: string, label?: string) => HTMLDivElement;
    };
    Separator: () => HTMLHRElement;
    Label: (text: string) => HTMLDivElement;
  } {
    const { positioning, ...rest } = options;
    return Menu.Root({
      ...rest,
      positioning: {
        placement: 'bottom-start',
        ...positioning,
      },
    });
  },
};
