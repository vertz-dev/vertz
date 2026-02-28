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
    return result;
  };
}
