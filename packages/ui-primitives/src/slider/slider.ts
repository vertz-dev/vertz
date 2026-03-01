/**
 * Slider primitive - range slider with arrow key adjustment.
 * Follows WAI-ARIA slider pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setValueRange } from '../utils/aria';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export interface SliderOptions {
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onValueChange?: (value: number) => void;
}

export interface SliderState {
  value: Signal<number>;
  disabled: Signal<boolean>;
}

export interface SliderElements {
  root: HTMLDivElement;
  thumb: HTMLDivElement;
  track: HTMLDivElement;
}

export const Slider = {
  Root(options: SliderOptions = {}): SliderElements & { state: SliderState } {
    const {
      defaultValue = 0,
      min = 0,
      max = 100,
      step = 1,
      disabled = false,
      onValueChange,
    } = options;

    const state: SliderState = {
      value: signal(defaultValue),
      disabled: signal(disabled),
    };

    const root = document.createElement('div');
    root.id = uniqueId('slider');
    setDataState(root, disabled ? 'disabled' : 'active');

    const track = document.createElement('div');
    track.setAttribute('data-part', 'track');

    const thumb = document.createElement('div');
    thumb.setAttribute('role', 'slider');
    thumb.setAttribute('tabindex', disabled ? '-1' : '0');
    thumb.setAttribute('data-part', 'thumb');
    setValueRange(thumb, defaultValue, min, max);

    if (disabled) {
      thumb.setAttribute('aria-disabled', 'true');
    }

    function clamp(val: number): number {
      return Math.min(max, Math.max(min, val));
    }

    // Fill element shows the active range
    const fill = document.createElement('div');
    fill.setAttribute('data-part', 'fill');
    fill.style.cssText = 'position: absolute; height: 100%; border-radius: inherit;';

    function updatePosition(pct: number): void {
      thumb.style.left = `${pct}%`;
      fill.style.width = `${pct}%`;
    }

    function setValue(val: number): void {
      if (state.disabled.peek()) return;
      const clamped = clamp(val);
      state.value.value = clamped;
      setValueRange(thumb, clamped, min, max);
      const pct = ((clamped - min) / (max - min)) * 100;
      updatePosition(pct);
      setDataState(root, 'active');
      onValueChange?.(clamped);
    }

    function valueFromPointer(event: PointerEvent): number {
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const raw = min + pct * (max - min);
      return Math.round(raw / step) * step;
    }

    thumb.addEventListener('keydown', (event) => {
      if (state.disabled.peek()) return;
      const current = state.value.peek();

      if (isKey(event, Keys.ArrowRight, Keys.ArrowUp)) {
        event.preventDefault();
        setValue(current + step);
      } else if (isKey(event, Keys.ArrowLeft, Keys.ArrowDown)) {
        event.preventDefault();
        setValue(current - step);
      } else if (isKey(event, Keys.Home)) {
        event.preventDefault();
        setValue(min);
      } else if (isKey(event, Keys.End)) {
        event.preventDefault();
        setValue(max);
      }
    });

    // Pointer drag support
    root.addEventListener('pointerdown', (event) => {
      if (state.disabled.peek()) return;
      event.preventDefault();
      setValue(valueFromPointer(event));
      thumb.focus();

      function onMove(e: PointerEvent): void {
        setValue(valueFromPointer(e));
      }
      function onUp(): void {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      }
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });

    // Position thumb absolutely within the track, centered vertically
    thumb.style.position = 'absolute';
    thumb.style.transform = 'translate(-50%, -50%)';

    track.style.position = 'relative';
    track.appendChild(fill);
    track.appendChild(thumb);
    root.appendChild(track);

    // Initialize position
    const pct = ((defaultValue - min) / (max - min)) * 100;
    updatePosition(pct);

    return { root, thumb, track, state };
  },
};
