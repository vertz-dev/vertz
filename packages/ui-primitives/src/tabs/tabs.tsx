/**
 * Tabs primitive - tablist/tab/tabpanel with arrow key navigation.
 * Follows WAI-ARIA tabs pattern with roving tabindex.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setHidden, setSelected } from '../utils/aria';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { setRovingTabindex } from '../utils/focus';
import { uniqueId } from '../utils/id';
import { handleListNavigation } from '../utils/keyboard';

export interface TabsOptions extends ElementAttrs {
  defaultValue?: string;
  orientation?: 'horizontal' | 'vertical';
  onValueChange?: (value: string) => void;
}

export interface TabsState {
  value: Signal<string>;
}

export interface TabsElements {
  root: HTMLElement;
  list: HTMLElement;
}

function TabList(
  orientation: 'horizontal' | 'vertical',
  triggers: HTMLElement[],
  tabValues: string[],
  selectTab: (value: string) => void,
): HTMLElement {
  return (
    <div
      role="tablist"
      aria-orientation={orientation === 'vertical' ? 'vertical' : undefined}
      onKeydown={(event: KeyboardEvent) => {
        const result = handleListNavigation(event, triggers, {
          orientation,
        });
        if (result) {
          const idx = triggers.indexOf(result);
          if (idx >= 0) {
            const val = tabValues[idx];
            if (val !== undefined) selectTab(val);
          }
        }
      }}
    />
  ) as HTMLElement;
}

function TabTrigger(
  triggerId: string,
  panelId: string,
  value: string,
  label: string | undefined,
  isActive: boolean,
  selectTab: (value: string) => void,
): HTMLElement {
  return (
    <button
      type="button"
      role="tab"
      id={triggerId}
      aria-controls={panelId}
      data-value={value}
      aria-selected={isActive ? 'true' : 'false'}
      data-state={isActive ? 'active' : 'inactive'}
      onClick={() => {
        selectTab(value);
      }}
    >
      {label ?? value}
    </button>
  ) as HTMLElement;
}

function TabsContainer(list: HTMLElement): HTMLElement {
  return (<div>{list}</div>) as HTMLElement;
}

function TabPanel(panelId: string, triggerId: string, isActive: boolean): HTMLElement {
  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={triggerId}
      tabindex="0"
      aria-hidden={isActive ? 'false' : 'true'}
      data-state={isActive ? 'active' : 'inactive'}
      style={isActive ? '' : 'display: none'}
    />
  ) as HTMLElement;
}

function TabsRoot(options: TabsOptions = {}): TabsElements & {
  state: TabsState;
  Tab: (
    value: string,
    label?: string,
  ) => {
    trigger: HTMLElement;
    panel: HTMLElement;
  };
  destroy: () => void;
} {
  const { defaultValue = '', orientation = 'horizontal', onValueChange, ...attrs } = options;
  const state: TabsState = { value: signal(defaultValue) };
  const triggers: HTMLElement[] = [];
  const panels: HTMLElement[] = [];
  const tabValues: string[] = [];

  function selectTab(value: string): void {
    state.value.value = value;
    for (let i = 0; i < tabValues.length; i++) {
      const isActive = tabValues[i] === value;
      const trig = triggers[i];
      const panel = panels[i];
      if (!trig || !panel) continue;

      setSelected(trig, isActive);
      setDataState(trig, isActive ? 'active' : 'inactive');
      trig.setAttribute('tabindex', isActive ? '0' : '-1');

      setHidden(panel, !isActive);
      setDataState(panel, isActive ? 'active' : 'inactive');
    }
    onValueChange?.(value);
  }

  const list = TabList(orientation, triggers, tabValues, selectTab);
  const root = TabsContainer(list);
  const cleanups: (() => void)[] = [];

  function Tab(value: string, label?: string): { trigger: HTMLElement; panel: HTMLElement } {
    const baseId = uniqueId('tab');
    const triggerId = `${baseId}-trigger`;
    const panelId = `${baseId}-panel`;
    const isActive = value === state.value.peek();

    const trig = TabTrigger(triggerId, panelId, value, label, isActive, selectTab);
    const handleClick = () => {
      trig.focus();
    };
    trig.addEventListener('click', handleClick);
    cleanups.push(() => trig.removeEventListener('click', handleClick));

    const panel = TabPanel(panelId, triggerId, isActive);

    triggers.push(trig);
    panels.push(panel);
    tabValues.push(value);
    list.appendChild(trig);
    root.appendChild(panel);

    setRovingTabindex(
      triggers,
      triggers.findIndex((t) => tabValues[triggers.indexOf(t)] === state.value.peek()),
    );

    return { trigger: trig, panel };
  }

  /** Remove manually-added event listeners. JSX-wired handlers are cleaned up by DOM removal. */
  function destroy(): void {
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
  }

  applyAttrs(root, attrs);

  return { root, list, state, Tab, destroy };
}

export const Tabs: {
  Root: (options?: TabsOptions) => TabsElements & {
    state: TabsState;
    Tab: (
      value: string,
      label?: string,
    ) => {
      trigger: HTMLElement;
      panel: HTMLElement;
    };
    destroy: () => void;
  };
} = {
  Root: TabsRoot,
};
