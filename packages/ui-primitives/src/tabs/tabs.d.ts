/**
 * Tabs primitive - tablist/tab/tabpanel with arrow key navigation.
 * Follows WAI-ARIA tabs pattern with roving tabindex.
 */
import type { Signal } from '@vertz/ui';
export interface TabsOptions {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}
export interface TabsState {
  value: Signal<string>;
}
export interface TabsElements {
  root: HTMLDivElement;
  list: HTMLDivElement;
}
export declare const Tabs: {
  Root(options?: TabsOptions): TabsElements & {
    state: TabsState;
    Tab: (
      value: string,
      label?: string,
    ) => {
      trigger: HTMLButtonElement;
      panel: HTMLDivElement;
    };
  };
};
//# sourceMappingURL=tabs.d.ts.map
