import type { ChildValue } from '@vertz/ui';
import { ComposedCarousel, withStyles } from '@vertz/ui-primitives';

interface CarouselStyleClasses {
  readonly root: string;
  readonly viewport: string;
  readonly slide: string;
  readonly prevButton: string;
  readonly nextButton: string;
}

// ── Props ──────────────────────────────────────────────────

export interface CarouselRootProps {
  orientation?: 'horizontal' | 'vertical';
  loop?: boolean;
  defaultIndex?: number;
  onSlideChange?: (index: number) => void;
  children?: ChildValue;
}

export interface CarouselSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedCarouselComponent {
  (props: CarouselRootProps): HTMLElement;
  Slide: (props: CarouselSlotProps) => HTMLElement;
  Previous: (props: CarouselSlotProps) => HTMLElement;
  Next: (props: CarouselSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedCarousel(styles: CarouselStyleClasses): ThemedCarouselComponent {
  const StyledCarousel = withStyles(ComposedCarousel, {
    root: styles.root,
    viewport: styles.viewport,
    slide: styles.slide,
    prevButton: styles.prevButton,
    nextButton: styles.nextButton,
  });

  function CarouselRoot({
    orientation,
    loop,
    defaultIndex,
    onSlideChange,
    children,
  }: CarouselRootProps) {
    return (
      <StyledCarousel
        orientation={orientation}
        loop={loop}
        defaultIndex={defaultIndex}
        onSlideChange={onSlideChange}
      >
        {children}
      </StyledCarousel>
    );
  }

  return Object.assign(CarouselRoot, {
    Slide: ComposedCarousel.Slide,
    Previous: ComposedCarousel.Previous,
    Next: ComposedCarousel.Next,
  });
}
