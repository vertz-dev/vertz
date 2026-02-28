import type { TabsElements, TabsOptions, TabsState } from '@vertz/ui-primitives';
import { Tabs } from '@vertz/ui-primitives';

interface TabsStyleClasses {
  readonly list: string;
  readonly trigger: string;
  readonly panel: string;
  readonly listLine: string;
  readonly triggerLine: string;
}

export interface ThemedTabsOptions extends TabsOptions {
  variant?: 'default' | 'line';
}

export interface ThemedTabsResult extends TabsElements {
  state: TabsState;
  Tab: (value: string, label?: string) => { trigger: HTMLButtonElement; panel: HTMLDivElement };
}

export function createThemedTabs(
  styles: TabsStyleClasses,
): (options?: ThemedTabsOptions) => ThemedTabsResult {
  return function themedTabs(options?: ThemedTabsOptions): ThemedTabsResult {
    const { variant, ...primitiveOptions } = options ?? {};
    const result = Tabs.Root(primitiveOptions);
    const originalTab = result.Tab;
    const isLine = variant === 'line';
    result.list.classList.add(isLine ? styles.listLine : styles.list);
    return {
      root: result.root,
      list: result.list,
      state: result.state,
      Tab: (value: string, label?: string) => {
        const tab = originalTab(value, label);
        tab.trigger.classList.add(isLine ? styles.triggerLine : styles.trigger);
        tab.panel.classList.add(styles.panel);
        return tab;
      },
    };
  };
}
