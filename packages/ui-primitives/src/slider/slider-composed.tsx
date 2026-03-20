/**
 * Composed Slider — declarative JSX component with class distribution.
 * Builds on the same behavior as Slider.Root but in a fully declarative structure.
 * Returns HTMLElement (no imperative state — use Slider.Root for that).
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { ref } from '@vertz/ui';
import { setValueRange } from '../utils/aria';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface SliderClasses {
  root?: string;
  track?: string;
  range?: string;
  thumb?: string;
}

export type SliderClassKey = keyof SliderClasses;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ComposedSliderProps {
  children?: ChildValue;
  classes?: SliderClasses;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onValueChange?: (value: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ComposedSliderRoot({
  classes,
  defaultValue = 0,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  onValueChange,
}: ComposedSliderProps) {
  let currentValue = defaultValue;
  const thumbRef: Ref<HTMLDivElement> = ref();
  const fillRef: Ref<HTMLDivElement> = ref();
  const trackRef: Ref<HTMLDivElement> = ref();

  function clamp(val: number): number {
    return Math.min(max, Math.max(min, val));
  }

  function updatePosition(pct: number): void {
    const thumb = thumbRef.current;
    const fill = fillRef.current;
    if (thumb) thumb.style.left = `${pct}%`;
    if (fill) fill.style.width = `${pct}%`;
  }

  function setValue(val: number): void {
    if (disabled) return;
    const clamped = clamp(val);
    currentValue = clamped;
    const thumb = thumbRef.current;
    if (thumb) setValueRange(thumb, clamped, min, max);
    const pct = ((clamped - min) / (max - min)) * 100;
    updatePosition(pct);
    onValueChange?.(clamped);
  }

  function valueFromPointer(event: PointerEvent): number {
    const track = trackRef.current;
    if (!track) return min;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const raw = min + pct * (max - min);
    return Math.round(raw / step) * step;
  }

  const initialPct = ((defaultValue - min) / (max - min)) * 100;

  return (
    <div
      id={uniqueId('slider')}
      data-state={disabled ? 'disabled' : 'active'}
      class={classes?.root}
      onPointerdown={(event: PointerEvent) => {
        if (disabled) return;
        event.preventDefault();
        setValue(valueFromPointer(event));
        thumbRef.current?.focus();

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
      <div ref={trackRef} data-part="track" style={{ position: 'relative' }} class={classes?.track}>
        <div
          ref={fillRef}
          data-part="fill"
          style={{
            position: 'absolute',
            height: '100%',
            borderRadius: 'inherit',
            width: `${initialPct}%`,
          }}
          class={classes?.range}
        />
        <div
          ref={thumbRef}
          role="slider"
          tabindex={disabled ? '-1' : '0'}
          data-part="thumb"
          aria-valuenow={String(defaultValue)}
          aria-valuemin={String(min)}
          aria-valuemax={String(max)}
          aria-disabled={disabled ? 'true' : undefined}
          style={{
            position: 'absolute',
            transform: 'translate(-50%, -50%)',
            left: `${initialPct}%`,
          }}
          class={classes?.thumb}
          onKeydown={(event: KeyboardEvent) => {
            if (disabled) return;
            if (isKey(event, Keys.ArrowRight, Keys.ArrowUp)) {
              event.preventDefault();
              setValue(currentValue + step);
            } else if (isKey(event, Keys.ArrowLeft, Keys.ArrowDown)) {
              event.preventDefault();
              setValue(currentValue - step);
            } else if (isKey(event, Keys.Home)) {
              event.preventDefault();
              setValue(min);
            } else if (isKey(event, Keys.End)) {
              event.preventDefault();
              setValue(max);
            }
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedSlider = ComposedSliderRoot as ((
  props: ComposedSliderProps,
) => HTMLElement) & {
  __classKeys?: SliderClassKey;
};
