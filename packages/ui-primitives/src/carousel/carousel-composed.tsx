/**
 * Composed Carousel — compound component with slide navigation.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * No registration, no resolveChildren, no internal API imports.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, onMount, useContext } from '@vertz/ui';

// ---------------------------------------------------------------------------
// Class types
// ---------------------------------------------------------------------------

export interface CarouselClasses {
  root?: string;
  viewport?: string;
  slide?: string;
  prevButton?: string;
  nextButton?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface CarouselContextValue {
  currentIndex: number;
  classes?: CarouselClasses;
}

const CarouselContext = createContext<CarouselContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::CarouselContext',
);

function useCarouselContext(componentName: string): CarouselContextValue {
  const ctx = useContext(CarouselContext);
  if (!ctx) {
    throw new Error(
      `<Carousel.${componentName}> must be used inside <Carousel>. ` +
        'Ensure it is a direct or nested child of the Carousel root component.',
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface SlideProps {
  children?: ChildValue;
  className?: string;
  class?: string;
}

interface SlotProps {
  children?: ChildValue;
}

// ---------------------------------------------------------------------------
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function CarouselSlide({ children, className: cls, class: classProp }: SlideProps) {
  const ctx = useCarouselContext('Slide');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.slide, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      role="group"
      aria-roledescription="slide"
      data-carousel-slide=""
      class={combined || undefined}
    >
      {children}
    </div>
  );
}

function CarouselPrevious({ children }: SlotProps) {
  return (
    <button
      type="button"
      aria-label="Previous slide"
      data-carousel-prev=""
    >
      {children}
    </button>
  );
}

function CarouselNext({ children }: SlotProps) {
  return (
    <button
      type="button"
      aria-label="Next slide"
      data-carousel-next=""
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export interface ComposedCarouselProps {
  children?: ChildValue;
  classes?: CarouselClasses;
  orientation?: 'horizontal' | 'vertical';
  loop?: boolean;
  defaultIndex?: number;
  onSlideChange?: (index: number) => void;
}

export type CarouselClassKey = keyof CarouselClasses;

function ComposedCarouselRoot({
  children,
  classes,
  orientation = 'horizontal',
  loop = false,
  defaultIndex = 0,
  onSlideChange,
}: ComposedCarouselProps) {
  let currentIndex = defaultIndex;

  // Wire navigation handlers via event delegation on the connected root.
  onMount(() => {
    const root = document.querySelector('[data-carousel-root]') as HTMLElement & { __carouselWired?: boolean } | null;
    if (!root || root.__carouselWired) return;
    root.__carouselWired = true;

    function getSlides(): HTMLElement[] {
      return [...root!.querySelectorAll<HTMLElement>('[data-carousel-slide]')];
    }

    function updateDOM(): void {
      const slides = getSlides();
      const slideCount = slides.length;
      slides.forEach((slide, i) => {
        slide.setAttribute('aria-hidden', String(i !== currentIndex));
        slide.setAttribute('aria-label', `Slide ${i + 1} of ${slideCount}`);
        slide.setAttribute('data-state', i === currentIndex ? 'active' : 'inactive');
      });

      const prevBtn = root!.querySelector('[data-carousel-prev]') as HTMLButtonElement | null;
      const nextBtn = root!.querySelector('[data-carousel-next]') as HTMLButtonElement | null;
      if (!loop && prevBtn) prevBtn.disabled = currentIndex <= 0;
      if (!loop && nextBtn) nextBtn.disabled = currentIndex >= slideCount - 1;

      const viewport = root!.querySelector('[data-carousel-viewport]') as HTMLElement | null;
      if (viewport) {
        const prop = orientation === 'horizontal' ? 'translateX' : 'translateY';
        viewport.style.transform = `${prop}(-${currentIndex * 100}%)`;
      }
    }

    function goTo(index: number): void {
      const slideCount = getSlides().length;
      if (slideCount === 0) return;
      let next = index;
      if (loop) {
        next = ((index % slideCount) + slideCount) % slideCount;
      } else {
        next = Math.max(0, Math.min(slideCount - 1, index));
      }
      if (next === currentIndex) return;
      currentIndex = next;
      updateDOM();
      onSlideChange?.(next);
    }

    root.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-carousel-prev]')) goTo(currentIndex - 1);
      if (target.closest('[data-carousel-next]')) goTo(currentIndex + 1);
    });

    root.addEventListener('keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      const prevKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
      const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
      if (ke.key === prevKey) { ke.preventDefault(); goTo(currentIndex - 1); }
      if (ke.key === nextKey) { ke.preventDefault(); goTo(currentIndex + 1); }
    });

    // Initial state
    updateDOM();
  });

  const ctx: CarouselContextValue = {
    currentIndex,
    classes,
  };

  const translateProp = orientation === 'horizontal' ? 'translateX' : 'translateY';

  return (
    <CarouselContext.Provider value={ctx}>
      <div
        role="region"
        aria-roledescription="carousel"
        data-carousel-root=""
        data-orientation={orientation}
        class={classes?.root}
      >
        <div
          data-carousel-viewport=""
          style={`overflow: hidden; transform: ${translateProp}(-${defaultIndex * 100}%)`}
          class={classes?.viewport}
        >
          {children}
        </div>
      </div>
    </CarouselContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedCarousel = Object.assign(ComposedCarouselRoot, {
  Slide: CarouselSlide,
  Previous: CarouselPrevious,
  Next: CarouselNext,
}) as ((props: ComposedCarouselProps) => HTMLElement) & {
  __classKeys?: CarouselClassKey;
  Slide: (props: SlideProps) => HTMLElement;
  Previous: (props: SlotProps) => HTMLElement;
  Next: (props: SlotProps) => HTMLElement;
};
