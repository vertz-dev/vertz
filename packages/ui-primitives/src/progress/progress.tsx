/**
 * Progress primitive - progress indicator with aria-valuenow/min/max.
 * Follows WAI-ARIA progressbar pattern.
 */

import { setDataState } from '../utils/aria';
import { uniqueId } from '../utils/id';

export interface ProgressOptions {
  defaultValue?: number;
  min?: number;
  max?: number;
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
  const { defaultValue = 0, min = 0, max = 100 } = options;

  const initialPct = ((defaultValue - min) / (max - min)) * 100;

  const indicator = (
    <div data-part="indicator" style={`width: ${initialPct}%`} />
  ) as HTMLDivElement;

  const root = (
    <div
      role="progressbar"
      id={uniqueId('progress')}
      aria-valuenow={String(defaultValue)}
      aria-valuemin={String(min)}
      aria-valuemax={String(max)}
      data-state={dataStateFor(initialPct)}
    >
      {indicator}
    </div>
  ) as HTMLDivElement;

  function setValue(val: number): void {
    const clamped = Math.min(max, Math.max(min, val));
    root.setAttribute('aria-valuenow', String(clamped));
    const pct = ((clamped - min) / (max - min)) * 100;
    indicator.style.width = `${pct}%`;
    setDataState(root, dataStateFor(pct));
  }

  return { root, indicator, setValue };
}

export const Progress: {
  Root: (options?: ProgressOptions) => ProgressElements & { setValue: (value: number) => void };
} = {
  Root: ProgressRoot,
};
