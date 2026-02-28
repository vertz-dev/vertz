import type { CarouselElements, CarouselOptions, CarouselState } from '@vertz/ui-primitives';
import { Carousel } from '@vertz/ui-primitives';

interface CarouselStyleClasses {
  readonly root: string;
  readonly viewport: string;
  readonly slide: string;
  readonly prevButton: string;
  readonly nextButton: string;
}

export interface ThemedCarouselResult extends CarouselElements {
  state: CarouselState;
  Slide: () => HTMLDivElement;
  goTo: (index: number) => void;
  goNext: () => void;
  goPrev: () => void;
}

export function createThemedCarousel(
  styles: CarouselStyleClasses,
): (options?: CarouselOptions) => ThemedCarouselResult {
  return function themedCarousel(options?: CarouselOptions): ThemedCarouselResult {
    const result = Carousel.Root(options);
    const originalSlide = result.Slide;

    result.root.classList.add(styles.root);
    result.viewport.classList.add(styles.viewport);
    result.prevButton.classList.add(styles.prevButton);
    result.nextButton.classList.add(styles.nextButton);

    return {
      root: result.root,
      viewport: result.viewport,
      prevButton: result.prevButton,
      nextButton: result.nextButton,
      state: result.state,
      goTo: result.goTo,
      goNext: result.goNext,
      goPrev: result.goPrev,
      Slide: () => {
        const slide = originalSlide();
        slide.classList.add(styles.slide);
        return slide;
      },
    };
  };
}
