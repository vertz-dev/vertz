/**
 * Progress primitive - progress indicator with aria-valuenow/min/max.
 * Follows WAI-ARIA progressbar pattern.
 */
import { signal } from '@vertz/ui';
import { setDataState, setValueRange } from '../utils/aria';
import { uniqueId } from '../utils/id';
export const Progress = {
  Root(options = {}) {
    const { defaultValue = 0, min = 0, max = 100 } = options;
    const state = { value: signal(defaultValue) };
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
    function setValue(val) {
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
//# sourceMappingURL=progress.js.map
