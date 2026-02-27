import type { TabsElements, TabsOptions, TabsState } from '@vertz/ui-primitives';
import { Tabs } from '@vertz/ui-primitives';

interface TabsStyleClasses {
  readonly list: string;
  readonly trigger: string;
  readonly panel: string;
}

export interface ThemedTabsResult extends TabsElements {
  state: TabsState;
  Tab: (value: string, label?: string) => { trigger: HTMLButtonElement; panel: HTMLDivElement };
}

export function createThemedTabs(
  styles: TabsStyleClasses,
): (options?: TabsOptions) => ThemedTabsResult {
  return function themedTabs(options?: TabsOptions): ThemedTabsResult {
    const result = Tabs.Root(options);
    const originalTab = result.Tab;
    result.list.classList.add(styles.list);
    return {
      root: result.root,
      list: result.list,
      state: result.state,
      Tab: (value: string, label?: string) => {
        const tab = originalTab(value, label);
        tab.trigger.classList.add(styles.trigger);
        tab.panel.classList.add(styles.panel);
        return tab;
      },
    };
  };
}
