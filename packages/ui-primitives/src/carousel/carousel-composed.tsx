/**
 * Composed Carousel — compound component with slide navigation.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * Slides register themselves to get their index, then reactively compute
 * their own attributes from context — no querySelectorAll, no setAttribute.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';

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
  registerSlide: () => number;
  currentIndex: number;
  getSlideCount: () => number;
  loop: boolean;
  classes?: CarouselClasses;
}

const CarouselContext = createContext<CarouselContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::CarouselContext',
);

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
// Sub-components — each renders its own DOM, driven by reactive context.
// NOTE: Each child calls useContext() directly (not through a wrapper) so the
// compiler recognises the result as a reactive source and generates reactive
// __attr() bindings instead of static setAttribute() calls.
// ---------------------------------------------------------------------------

function CarouselSlide({ children, className: cls, class: classProp }: SlideProps) {
  const ctx = useContext(CarouselContext);
  if (!ctx) {
    throw new Error(
      '<Carousel.Slide> must be used inside <Carousel>. ' +
        'Ensure it is a direct or nested child of the Carousel root component.',
    );
  }
  const index = ctx.registerSlide();
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.slide, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      role="group"
      aria-roledescription="slide"
      data-carousel-slide=""
      aria-hidden={String(index !== ctx.currentIndex)}
      aria-label={`Slide ${index + 1} of ${ctx.getSlideCount()}`}
      data-state={index === ctx.currentIndex ? 'active' : 'inactive'}
      class={combined || undefined}
    >
      {children}
    </div>
  );
}

function CarouselPrevious({ children }: SlotProps) {
  const ctx = useContext(CarouselContext);
  if (!ctx) {
    throw new Error(
      '<Carousel.Previous> must be used inside <Carousel>. ' +
        'Ensure it is a direct or nested child of the Carousel root component.',
    );
  }
  return (
    <button
      type="button"
      aria-label="Previous slide"
      data-carousel-prev=""
      disabled={!ctx.loop && ctx.currentIndex <= 0}
      class={ctx.classes?.prevButton}
    >
      {children ?? '\u2039'}
    </button>
  );
}

function CarouselNext({ children }: SlotProps) {
  const ctx = useContext(CarouselContext);
  if (!ctx) {
    throw new Error(
      '<Carousel.Next> must be used inside <Carousel>. ' +
        'Ensure it is a direct or nested child of the Carousel root component.',
    );
  }
  return (
    <button
      type="button"
      aria-label="Next slide"
      data-carousel-next=""
      disabled={!ctx.loop && ctx.currentIndex >= ctx.getSlideCount() - 1}
      class={ctx.classes?.nextButton}
    >
      {children ?? '\u203A'}
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
  // _reg uses a plain object so the compiler doesn't transform it into a
  // signal.  registerSlide() is called inside a computed (because children
  // access it through useContext — a reactive source) so it must NOT read any
  // signal, otherwise the computed would re-evaluate on every signal change
  // and call registerSlide() again.  We write to the slideCount signal
  // (write-only, no read) so that other effects (aria-labels) pick up the
  // final count reactively.
  const _reg = { nextIdx: 0 };
  let slideCount = 0;

  function registerSlide(): number {
    const idx = _reg.nextIdx++;
    slideCount = _reg.nextIdx;
    return idx;
  }

  function goTo(index: number): void {
    const count = _reg.nextIdx;
    if (count === 0) return;
    let next = index;
    if (loop) {
      next = ((index % count) + count) % count;
    } else {
      next = Math.max(0, Math.min(count - 1, index));
    }
    if (next === currentIndex) return;
    currentIndex = next;
    onSlideChange?.(next);
  }

  function handleClick(e: MouseEvent): void {
    const target = e.target as Element;
    if (target.closest('[data-carousel-prev]')) goTo(currentIndex - 1);
    if (target.closest('[data-carousel-next]')) goTo(currentIndex + 1);
  }

  function handleKeydown(e: KeyboardEvent): void {
    const prevKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    if (e.key === prevKey) {
      e.preventDefault();
      goTo(currentIndex - 1);
    }
    if (e.key === nextKey) {
      e.preventDefault();
      goTo(currentIndex + 1);
    }
  }

  const ctx: CarouselContextValue = {
    registerSlide,
    currentIndex,
    getSlideCount: () => slideCount,
    loop,
    classes,
  };

  return (
    <CarouselContext.Provider value={ctx}>
      <div
        role="region"
        aria-roledescription="carousel"
        data-carousel-root=""
        data-orientation={orientation}
        class={classes?.root}
        onClick={handleClick}
        onKeydown={handleKeydown}
      >
        <div
          data-carousel-viewport=""
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
