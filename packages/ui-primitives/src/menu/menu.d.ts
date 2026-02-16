/**
 * Menu primitive - menubar/menuitem with arrow key navigation.
 * Follows WAI-ARIA menu pattern.
 */
import type { Signal } from '@vertz/ui';
export interface MenuOptions {
  onSelect?: (value: string) => void;
}
export interface MenuState {
  open: Signal<boolean>;
  activeIndex: Signal<number>;
}
export interface MenuElements {
  trigger: HTMLButtonElement;
  content: HTMLDivElement;
}
export declare const Menu: {
  Root(options?: MenuOptions): MenuElements & {
    state: MenuState;
    Item: (value: string, label?: string) => HTMLDivElement;
  };
};
//# sourceMappingURL=menu.d.ts.map
