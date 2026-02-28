import type { SliderElements, SliderOptions, SliderState } from '@vertz/ui-primitives';
import { Slider } from '@vertz/ui-primitives';

interface SliderStyleClasses {
  readonly root: string;
  readonly track: string;
  readonly thumb: string;
}

export function createThemedSlider(
  styles: SliderStyleClasses,
): (options?: SliderOptions) => SliderElements & { state: SliderState } {
  return function themedSlider(options?: SliderOptions) {
    const result = Slider.Root(options);
    result.root.classList.add(styles.root);
    result.track.classList.add(styles.track);
    result.thumb.classList.add(styles.thumb);
    // Style the fill element
    const fill = result.track.querySelector('[data-part="fill"]') as HTMLElement | null;
    if (fill) {
      fill.style.backgroundColor = 'var(--color-primary)';
    }
    return result;
  };
}
