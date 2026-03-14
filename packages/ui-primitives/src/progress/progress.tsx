/**
 * Progress primitive - progress indicator with aria-valuenow/min/max.
 * Follows WAI-ARIA progressbar pattern.
 */

import type { Ref, Signal } from '@vertz/ui';
import { ref, signal } from '@vertz/ui';
import { setDataState } from '../utils/aria';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { uniqueId } from '../utils/id';

export interface ProgressOptions extends ElementAttrs {
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

function dataStateFor(pct: number): string {
  if (pct >= 100) return 'complete';
  if (pct > 0) return 'loading';
  return 'idle';
}

function ProgressRoot(options: ProgressOptions = {}) {
  const { defaultValue = 0, min = 0, max = 100, ...attrs } = options;
  const state: ProgressState = { value: signal(defaultValue) };
  const indicatorRef: Ref<HTMLDivElement> = ref();

  const initialPct = ((defaultValue - min) / (max - min)) * 100;

  const root = (
    <div
      role="progressbar"
      id={uniqueId('progress')}
      aria-valuenow={String(defaultValue)}
      aria-valuemin={String(min)}
      aria-valuemax={String(max)}
      data-state={dataStateFor(initialPct)}
    >
      <div ref={indicatorRef} data-part="indicator" style={`width: ${initialPct}%`} />
    </div>
  ) as HTMLDivElement;

  const indicator = indicatorRef.current!;

  applyAttrs(root, attrs);

  function setValue(val: number): void {
    const clamped = Math.min(max, Math.max(min, val));
    state.value.value = clamped;
    root.setAttribute('aria-valuenow', String(clamped));
    const pct = ((clamped - min) / (max - min)) * 100;
    indicator.style.width = `${pct}%`;
    setDataState(root, dataStateFor(pct));
  }

  return { root, indicator, state, setValue };
}

export const Progress: {
  Root: (options?: ProgressOptions) => ProgressElements & {
    state: ProgressState;
    setValue: (value: number) => void;
  };
} = {
  Root: ProgressRoot,
};
