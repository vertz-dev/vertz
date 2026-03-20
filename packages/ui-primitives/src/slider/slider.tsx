/**
 * Slider primitive - range slider with arrow key adjustment.
 * Follows WAI-ARIA slider pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setValueRange } from '../utils/aria';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export interface SliderOptions extends ElementAttrs {
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

function SliderRoot(options: SliderOptions = {}): SliderElements & { state: SliderState } {
  const {
    defaultValue = 0,
    min = 0,
    max = 100,
    step = 1,
    disabled = false,
    onValueChange,
    ...attrs
  } = options;

  const state: SliderState = {
    value: signal(defaultValue),
    disabled: signal(disabled),
  };

  function clamp(val: number): number {
    return Math.min(max, Math.max(min, val));
  }

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

  const fill = (
    <div
      data-part="fill"
      style={{ position: 'absolute', height: '100%', borderRadius: 'inherit' }}
    />
  ) as HTMLDivElement;

  const thumb = (
    <div
      role="slider"
      tabindex={disabled ? '-1' : '0'}
      data-part="thumb"
      aria-disabled={disabled ? 'true' : undefined}
      style={{ position: 'absolute', transform: 'translate(-50%, -50%)' }}
      onKeydown={(event: KeyboardEvent) => {
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
      }}
    />
  ) as HTMLDivElement;

  setValueRange(thumb, defaultValue, min, max);

  const track = (
    <div data-part="track" style={{ position: 'relative' }}>
      {fill}
      {thumb}
    </div>
  ) as HTMLDivElement;

  const root = (
    <div
      id={uniqueId('slider')}
      data-state={disabled ? 'disabled' : 'active'}
      onPointerdown={(event: PointerEvent) => {
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
      }}
    >
      {track}
    </div>
  ) as HTMLDivElement;

  // Initialize position
  const pct = ((defaultValue - min) / (max - min)) * 100;
  updatePosition(pct);

  applyAttrs(root, attrs);

  return { root, thumb, track, state };
}

export const Slider: {
  Root: (options?: SliderOptions) => SliderElements & { state: SliderState };
} = {
  Root: SliderRoot,
};
