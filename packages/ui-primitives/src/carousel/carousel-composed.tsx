/**
 * Composed Carousel — fully declarative JSX component with slide navigation.
 * Follows WAI-ARIA carousel pattern.
 * Sub-components self-wire via context. No factory wrapping.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';

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
// Registration types
// ---------------------------------------------------------------------------

interface SlideRegistration {
  children: ChildValue;
  className: string | undefined;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface CarouselContextValue {
  classes?: CarouselClasses;
  _registerSlide: (reg: SlideRegistration) => void;
  _registerPrevious: (children: ChildValue) => void;
  _registerNext: (children: ChildValue) => void;
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
// Sub-components
// ---------------------------------------------------------------------------

function CarouselSlide({ children, className: cls, class: classProp }: SlideProps) {
  const ctx = useCarouselContext('Slide');
  ctx._registerSlide({ children, className: cls ?? classProp });
  return (<span style="display: contents" />) as HTMLElement;
}

function CarouselPrevious({ children }: SlotProps) {
  const ctx = useCarouselContext('Previous');
  ctx._registerPrevious(children);
  return (<span style="display: contents" />) as HTMLElement;
}

function CarouselNext({ children }: SlotProps) {
  const ctx = useCarouselContext('Next');
  ctx._registerNext(children);
  return (<span style="display: contents" />) as HTMLElement;
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
  // Registration storage — plain object so compiler doesn't signal-transform
  const reg: {
    slides: SlideRegistration[];
    prevChildren: ChildValue;
    nextChildren: ChildValue;
  } = { slides: [], prevChildren: undefined, nextChildren: undefined };

  const ctxValue: CarouselContextValue = {
    classes,
    _registerSlide: (slideReg) => {
      reg.slides.push(slideReg);
    },
    _registerPrevious: (prevChildren) => {
      if (reg.prevChildren === undefined) {
        reg.prevChildren = prevChildren;
      }
    },
    _registerNext: (nextChildren) => {
      if (reg.nextChildren === undefined) {
        reg.nextChildren = nextChildren;
      }
    },
  };

  // Phase 1: resolve children to collect registrations
  CarouselContext.Provider(ctxValue, () => {
    resolveChildren(children);
  });

  // Phase 2: build the carousel
  let currentIndex = defaultIndex;
  const slideCount = reg.slides.length;

  function goTo(index: number): void {
    if (slideCount === 0) return;
    let next = index;
    if (loop) {
      next = ((index % slideCount) + slideCount) % slideCount;
    } else {
      next = Math.max(0, Math.min(slideCount - 1, index));
    }
    if (next === currentIndex) return;
    currentIndex = next;
    updateSlideVisibility();
    onSlideChange?.(next);
  }

  function goNext(): void {
    goTo(currentIndex + 1);
  }

  function goPrev(): void {
    goTo(currentIndex - 1);
  }

  function updateSlideVisibility(): void {
    for (let i = 0; i < slideEls.length; i++) {
      const slide = slideEls[i];
      if (!slide) continue;
      slide.setAttribute('aria-hidden', String(i !== currentIndex));
      slide.setAttribute('aria-label', `Slide ${i + 1} of ${slideCount}`);
      slide.setAttribute('data-state', i === currentIndex ? 'active' : 'inactive');
    }
    if (!loop && prevButtonEl) {
      (prevButtonEl as HTMLButtonElement).disabled = currentIndex <= 0;
    }
    if (!loop && nextButtonEl) {
      (nextButtonEl as HTMLButtonElement).disabled = currentIndex >= slideCount - 1;
    }
    const translateProp = orientation === 'horizontal' ? 'translateX' : 'translateY';
    if (viewportEl) {
      viewportEl.style.transform = `${translateProp}(-${currentIndex * 100}%)`;
    }
  }

  const isKey = (e: KeyboardEvent, key: string) => e.key === key;

  function handleKeydown(event: KeyboardEvent): void {
    const prevKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    if (isKey(event, prevKey)) {
      event.preventDefault();
      goPrev();
    }
    if (isKey(event, nextKey)) {
      event.preventDefault();
      goNext();
    }
  }

  // Build slide elements
  const slideEls: HTMLDivElement[] = [];
  const slideNodes = reg.slides.map((slideReg, i) => {
    const resolved = resolveChildren(slideReg.children);
    const slideClass = [classes?.slide, slideReg.className].filter(Boolean).join(' ') || undefined;
    const isActive = i === defaultIndex;
    const el = (
      <div
        role="group"
        aria-roledescription="slide"
        aria-hidden={isActive ? 'false' : 'true'}
        aria-label={`Slide ${i + 1} of ${slideCount}`}
        data-state={isActive ? 'active' : 'inactive'}
        class={slideClass}
      >
        {...resolved}
      </div>
    ) as HTMLDivElement;
    slideEls.push(el);
    return el;
  });

  // Resolve prev/next button content
  const prevContent = resolveChildren(reg.prevChildren);
  const nextContent = resolveChildren(reg.nextChildren);

  // Build viewport
  const viewportEl = (
    <div style="overflow: hidden;" class={classes?.viewport}>
      {...slideNodes}
    </div>
  ) as HTMLDivElement;

  // Build prev/next buttons
  const prevButtonEl = (
    <button
      type="button"
      aria-label="Previous slide"
      class={classes?.prevButton}
      disabled={!loop && defaultIndex <= 0}
      onClick={goPrev}
    >
      {...prevContent}
    </button>
  ) as HTMLButtonElement;

  const nextButtonEl = (
    <button
      type="button"
      aria-label="Next slide"
      class={classes?.nextButton}
      disabled={!loop && defaultIndex >= slideCount - 1}
      onClick={goNext}
    >
      {...nextContent}
    </button>
  ) as HTMLButtonElement;

  // Apply initial transform
  const translateProp = orientation === 'horizontal' ? 'translateX' : 'translateY';
  viewportEl.style.transform = `${translateProp}(-${defaultIndex * 100}%)`;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      data-orientation={orientation}
      class={classes?.root}
      onKeydown={handleKeydown}
    >
      {viewportEl}
      {prevButtonEl}
      {nextButtonEl}
    </div>
  ) as HTMLElement;
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
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
