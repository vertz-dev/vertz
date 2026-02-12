/**
 * Progress primitive - progress indicator with aria-valuenow/min/max.
 * Follows WAI-ARIA progressbar pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setValueRange } from '../utils/aria';
import { uniqueId } from '../utils/id';

export interface ProgressOptions {
  defaultValue?: number;
  min?: number;
  max?: number;
}

export interface ProgressState {
  value: Signal<number>;
}

export interface ProgressElements {
  root: HTMLDivElement;
  indicator: HTMLDivElement;
}

export const Progress = {
  Root(options: ProgressOptions = {}): ProgressElements & {
    state: ProgressState;
    setValue: (value: number) => void;
  } {
    const { defaultValue = 0, min = 0, max = 100 } = options;
    const state: ProgressState = { value: signal(defaultValue) };

    const root = document.createElement('div');
    root.setAttribute('role', 'progressbar');
    root.id = uniqueId('progress');
    setValueRange(root, defaultValue, min, max);

    const pct = ((defaultValue - min) / (max - min)) * 100;
    if (pct >= 100) {
      setDataState(root, 'complete');
    } else if (pct > 0) {
      setDataState(root, 'loading');
    } else {
      setDataState(root, 'idle');
    }

    const indicator = document.createElement('div');
    indicator.setAttribute('data-part', 'indicator');
    indicator.style.width = `${pct}%`;
    root.appendChild(indicator);

    function setValue(val: number): void {
      const clamped = Math.min(max, Math.max(min, val));
      state.value.value = clamped;
      setValueRange(root, clamped, min, max);
      const p = ((clamped - min) / (max - min)) * 100;
      indicator.style.width = `${p}%`;

      if (p >= 100) {
        setDataState(root, 'complete');
      } else if (p > 0) {
        setDataState(root, 'loading');
      } else {
        setDataState(root, 'idle');
      }
    }

    return { root, indicator, state, setValue };
  },
};
