/**
 * Tabs primitive - tablist/tab/tabpanel with arrow key navigation.
 * Follows WAI-ARIA tabs pattern with roving tabindex.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setHidden, setSelected } from '../utils/aria';
import { setRovingTabindex } from '../utils/focus';
import { uniqueId } from '../utils/id';
import { handleListNavigation } from '../utils/keyboard';

export interface TabsOptions {
  defaultValue?: string;
  orientation?: 'horizontal' | 'vertical';
  onValueChange?: (value: string) => void;
}

export interface TabsState {
  value: Signal<string>;
}

export interface TabsElements {
  root: HTMLDivElement;
  list: HTMLDivElement;
}

export const Tabs = {
  Root(options: TabsOptions = {}): TabsElements & {
    state: TabsState;
    Tab: (
      value: string,
      label?: string,
    ) => {
      trigger: HTMLButtonElement;
      panel: HTMLDivElement;
    };
  } {
    const { defaultValue = '', orientation = 'horizontal', onValueChange } = options;
    const state: TabsState = { value: signal(defaultValue) };
    const triggers: HTMLButtonElement[] = [];
    const panels: HTMLDivElement[] = [];
    const tabValues: string[] = [];

    const root = document.createElement('div');
    const list = document.createElement('div');
    list.setAttribute('role', 'tablist');
    if (orientation === 'vertical') {
      list.setAttribute('aria-orientation', 'vertical');
    }
    root.appendChild(list);

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

    list.addEventListener('keydown', (event) => {
      const result = handleListNavigation(event, triggers, {
        orientation,
      });
      if (result) {
        const idx = triggers.indexOf(result as HTMLButtonElement);
        if (idx >= 0) {
          const val = tabValues[idx];
          if (val !== undefined) selectTab(val);
        }
      }
    });

    function Tab(
      value: string,
      label?: string,
    ): { trigger: HTMLButtonElement; panel: HTMLDivElement } {
      const baseId = uniqueId('tab');
      const triggerId = `${baseId}-trigger`;
      const panelId = `${baseId}-panel`;
      const isActive = value === state.value.peek();

      const trig = document.createElement('button');
      trig.setAttribute('type', 'button');
      trig.setAttribute('role', 'tab');
      trig.id = triggerId;
      trig.setAttribute('aria-controls', panelId);
      trig.setAttribute('data-value', value);
      trig.textContent = label ?? value;
      setSelected(trig, isActive);
      setDataState(trig, isActive ? 'active' : 'inactive');

      const panel = document.createElement('div');
      panel.setAttribute('role', 'tabpanel');
      panel.id = panelId;
      panel.setAttribute('aria-labelledby', triggerId);
      panel.setAttribute('tabindex', '0');
      setHidden(panel, !isActive);
      setDataState(panel, isActive ? 'active' : 'inactive');

      trig.addEventListener('click', () => {
        selectTab(value);
        trig.focus();
      });

      triggers.push(trig);
      panels.push(panel);
      tabValues.push(value);
      list.appendChild(trig);
      root.appendChild(panel);

      // Update roving tabindex
      setRovingTabindex(
        triggers,
        triggers.findIndex((t) => tabValues[triggers.indexOf(t)] === state.value.peek()),
      );

      return { trigger: trig, panel };
    }

    return { root, list, state, Tab };
  },
};
