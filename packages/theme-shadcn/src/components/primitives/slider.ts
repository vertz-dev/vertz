import type { ChildValue } from '@vertz/ui';
import { ComposedSlider } from '@vertz/ui-primitives';

interface SliderStyleClasses {
  readonly root: string;
  readonly track: string;
  readonly range: string;
  readonly thumb: string;
}

// ── Props ──────────────────────────────────────────────────

export interface SliderRootProps {
  children?: ChildValue;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onValueChange?: (value: number) => void;
}

// ── Component type ─────────────────────────────────────────

export type ThemedSliderComponent = (props: SliderRootProps) => HTMLElement;

// ── Factory ────────────────────────────────────────────────

export function createThemedSlider(styles: SliderStyleClasses): ThemedSliderComponent {
  return function SliderRoot(props: SliderRootProps): HTMLElement {
    return ComposedSlider({
      ...props,
      classes: {
        root: styles.root,
        track: styles.track,
        range: styles.range,
        thumb: styles.thumb,
      },
    });
  };
}
