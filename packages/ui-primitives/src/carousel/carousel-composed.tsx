/**
 * Composed Carousel — compound component with slide navigation.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * No registration, no resolveChildren, no internal API imports.
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
  const ctx = useCarouselContext('Previous');
  return (
    <button
      type="button"
      aria-label="Previous slide"
      data-carousel-prev=""
      class={ctx.classes?.prevButton}
    >
      {children}
    </button>
  );
}

function CarouselNext({ children }: SlotProps) {
  const ctx = useCarouselContext('Next');
  return (
    <button
      type="button"
      aria-label="Next slide"
      data-carousel-next=""
      class={ctx.classes?.nextButton}
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

/**
 * Initialize slide attributes (aria-hidden, data-state, aria-label) and
 * button disabled states on the root element. Called once after the DOM tree
 * is constructed and on every navigation.
 */
function initCarouselDOM(
  rootEl: HTMLElement,
  currentIndex: number,
  loop: boolean,
  orientation: string,
): void {
  const slides = [...rootEl.querySelectorAll<HTMLElement>('[data-carousel-slide]')];
  const slideCount = slides.length;
  for (let i = 0; i < slideCount; i++) {
    const slide = slides[i];
    if (!slide) continue;
    slide.setAttribute('aria-hidden', String(i !== currentIndex));
    slide.setAttribute('aria-label', `Slide ${i + 1} of ${slideCount}`);
    slide.setAttribute('data-state', i === currentIndex ? 'active' : 'inactive');
  }

  const prevBtn = rootEl.querySelector('[data-carousel-prev]') as HTMLButtonElement | null;
  const nextBtn = rootEl.querySelector('[data-carousel-next]') as HTMLButtonElement | null;
  if (!loop && prevBtn) prevBtn.disabled = currentIndex <= 0;
  if (!loop && nextBtn) nextBtn.disabled = currentIndex >= slideCount - 1;

  const viewport = rootEl.querySelector('[data-carousel-viewport]') as HTMLElement | null;
  if (viewport) {
    const prop = orientation === 'horizontal' ? 'translateX' : 'translateY';
    viewport.style.transform = `${prop}(-${currentIndex * 100}%)`;
  }
}

function ComposedCarouselRoot({
  children,
  classes,
  orientation = 'horizontal',
  loop = false,
  defaultIndex = 0,
  onSlideChange,
}: ComposedCarouselProps) {
  let currentIndex = defaultIndex;

  function goTo(rootEl: HTMLElement, index: number): void {
    const slides = rootEl.querySelectorAll('[data-carousel-slide]');
    const slideCount = slides.length;
    if (slideCount === 0) return;
    let next = index;
    if (loop) {
      next = ((index % slideCount) + slideCount) % slideCount;
    } else {
      next = Math.max(0, Math.min(slideCount - 1, index));
    }
    if (next === currentIndex) return;
    currentIndex = next;
    initCarouselDOM(rootEl, currentIndex, loop, orientation);
    onSlideChange?.(next);
  }

  function handleClick(e: Event): void {
    const rootEl = e.currentTarget as HTMLElement;
    const target = e.target as HTMLElement;
    if (target.closest('[data-carousel-prev]')) goTo(rootEl, currentIndex - 1);
    if (target.closest('[data-carousel-next]')) goTo(rootEl, currentIndex + 1);
  }

  function handleKeydown(e: Event): void {
    const rootEl = e.currentTarget as HTMLElement;
    const ke = e as KeyboardEvent;
    const prevKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    if (ke.key === prevKey) {
      ke.preventDefault();
      goTo(rootEl, currentIndex - 1);
    }
    if (ke.key === nextKey) {
      ke.preventDefault();
      goTo(rootEl, currentIndex + 1);
    }
  }

  const ctx: CarouselContextValue = {
    currentIndex,
    classes,
  };

  const translateProp = orientation === 'horizontal' ? 'translateX' : 'translateY';

  // Use a plain object ref to capture the root element — the compiler
  // does not transform object property assignments into signals.
  const _ref = { root: null as HTMLElement | null };

  // Use Provider callback pattern to set context, then build the DOM tree.
  // This avoids assigning the Provider JSX result to a const, which the
  // compiler wraps in computed() — causing rootEl.querySelectorAll to fail
  // because the computed value may not be an HTMLElement (#1613).
  CarouselContext.Provider(ctx, () => {
    _ref.root = (
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
          style={{ overflow: 'hidden', transform: `${translateProp}(-${defaultIndex * 100}%)` }}
          class={classes?.viewport}
        >
          {children}
        </div>
      </div>
    ) as HTMLElement;
  });

  const rootEl = _ref.root as HTMLElement;
  initCarouselDOM(rootEl, currentIndex, loop, orientation);

  return rootEl;
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
