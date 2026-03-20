/**
 * Carousel primitive - slide-based content viewer with navigation.
 * Follows WAI-ARIA carousel pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState } from '../utils/aria';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { isKey, Keys } from '../utils/keyboard';

export interface CarouselOptions extends ElementAttrs {
  orientation?: 'horizontal' | 'vertical';
  loop?: boolean;
  defaultIndex?: number;
  onSlideChange?: (index: number) => void;
}

export interface CarouselState {
  currentIndex: Signal<number>;
  slideCount: Signal<number>;
}

export interface CarouselElements {
  root: HTMLDivElement;
  viewport: HTMLDivElement;
  prevButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
}

function CarouselRoot(options: CarouselOptions = {}): CarouselElements & {
  state: CarouselState;
  Slide: () => HTMLDivElement;
  goTo: (index: number) => void;
  goNext: () => void;
  goPrev: () => void;
} {
  const {
    orientation = 'horizontal',
    loop = false,
    defaultIndex = 0,
    onSlideChange,
    ...attrs
  } = options;

  const state: CarouselState = {
    currentIndex: signal(defaultIndex),
    slideCount: signal(0),
  };
  const slides: HTMLDivElement[] = [];

  function updateSlideVisibility(): void {
    const current = state.currentIndex.peek();
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      if (!slide) continue;
      slide.setAttribute('aria-hidden', String(i !== current));
      slide.setAttribute('aria-label', `Slide ${i + 1} of ${slides.length}`);
      setDataState(slide, i === current ? 'active' : 'inactive');
    }
    if (!loop) {
      prevButton.disabled = current <= 0;
      nextButton.disabled = current >= slides.length - 1;
    }
    const translateProp = orientation === 'horizontal' ? 'translateX' : 'translateY';
    viewport.style.transform = `${translateProp}(-${current * 100}%)`;
  }

  function goTo(index: number): void {
    const total = slides.length;
    if (total === 0) return;
    let next = index;
    if (loop) {
      next = ((index % total) + total) % total;
    } else {
      next = Math.max(0, Math.min(total - 1, index));
    }
    if (next === state.currentIndex.peek()) return;
    state.currentIndex.value = next;
    updateSlideVisibility();
    onSlideChange?.(next);
  }

  function goNext(): void {
    goTo(state.currentIndex.peek() + 1);
  }

  function goPrev(): void {
    goTo(state.currentIndex.peek() - 1);
  }

  const viewport = (<div style={{ overflow: 'hidden' }} />) as HTMLDivElement;

  const prevButton = (
    <button type="button" aria-label="Previous slide" onClick={goPrev} />
  ) as HTMLButtonElement;

  const nextButton = (
    <button type="button" aria-label="Next slide" onClick={goNext} />
  ) as HTMLButtonElement;

  const root = (
    <div
      role="region"
      aria-roledescription="carousel"
      data-orientation={orientation}
      onKeydown={(event: KeyboardEvent) => {
        const prevKey = orientation === 'horizontal' ? Keys.ArrowLeft : Keys.ArrowUp;
        const nextKey = orientation === 'horizontal' ? Keys.ArrowRight : Keys.ArrowDown;
        if (isKey(event, prevKey)) {
          event.preventDefault();
          goPrev();
        }
        if (isKey(event, nextKey)) {
          event.preventDefault();
          goNext();
        }
      }}
    >
      {viewport}
    </div>
  ) as HTMLDivElement;

  function Slide(): HTMLDivElement {
    const slide = (<div role="group" aria-roledescription="slide" />) as HTMLDivElement;
    slides.push(slide);
    state.slideCount.value = slides.length;
    viewport.appendChild(slide);
    updateSlideVisibility();
    return slide;
  }

  updateSlideVisibility();
  applyAttrs(root, attrs);

  return { root, viewport, prevButton, nextButton, state, Slide, goTo, goNext, goPrev };
}

export const Carousel: {
  Root: (options?: CarouselOptions) => CarouselElements & {
    state: CarouselState;
    Slide: () => HTMLDivElement;
    goTo: (index: number) => void;
    goNext: () => void;
    goPrev: () => void;
  };
} = {
  Root: CarouselRoot,
};
