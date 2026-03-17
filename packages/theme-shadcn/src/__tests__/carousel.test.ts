import { describe, expect, it } from 'bun:test';
import { createThemedCarousel } from '../components/primitives/carousel';
import { createCarouselStyles } from '../styles/carousel';

describe('carousel styles', () => {
  const carousel = createCarouselStyles();

  it('has root block', () => {
    expect(typeof carousel.root).toBe('string');
  });

  it('has viewport block', () => {
    expect(typeof carousel.viewport).toBe('string');
  });

  it('has slide block', () => {
    expect(typeof carousel.slide).toBe('string');
  });

  it('has prevButton block', () => {
    expect(typeof carousel.prevButton).toBe('string');
  });

  it('has nextButton block', () => {
    expect(typeof carousel.nextButton).toBe('string');
  });

  it('class names are non-empty', () => {
    expect(carousel.root.length).toBeGreaterThan(0);
    expect(carousel.viewport.length).toBeGreaterThan(0);
    expect(carousel.slide.length).toBeGreaterThan(0);
    expect(carousel.prevButton.length).toBeGreaterThan(0);
    expect(carousel.nextButton.length).toBeGreaterThan(0);
  });

  it('CSS contains data-state selectors', () => {
    expect(carousel.css).toContain('[data-state=');
  });
});

describe('themed carousel', () => {
  const styles = createCarouselStyles();
  const Carousel = createThemedCarousel({
    root: styles.root,
    viewport: styles.viewport,
    slide: styles.slide,
    prevButton: styles.prevButton,
    nextButton: styles.nextButton,
  });

  it('creates a themed carousel component with sub-components', () => {
    expect(typeof Carousel).toBe('function');
    expect(typeof Carousel.Slide).toBe('function');
    expect(typeof Carousel.Previous).toBe('function');
    expect(typeof Carousel.Next).toBe('function');
  });

  it('renders a carousel with themed classes', () => {
    const root = Carousel({
      children: () => {
        const s1 = Carousel.Slide({ children: ['Slide 1'] });
        const s2 = Carousel.Slide({ children: ['Slide 2'] });
        const prev = Carousel.Previous({ children: ['Prev'] });
        const next = Carousel.Next({ children: ['Next'] });
        return [s1, s2, prev, next];
      },
    });

    expect(root.getAttribute('role')).toBe('region');
    expect(root.getAttribute('aria-roledescription')).toBe('carousel');
    expect(root.classList.contains(styles.root)).toBe(true);
  });

  it('applies slide class to rendered slides', () => {
    const root = Carousel({
      children: () => {
        const s1 = Carousel.Slide({ children: ['Slide 1'] });
        return [s1];
      },
    });

    const slide = root.querySelector('[role="group"]') as HTMLElement;
    expect(slide.classList.contains(styles.slide)).toBe(true);
  });

  it('applies button classes to prev/next buttons', () => {
    const root = Carousel({
      children: () => {
        const s1 = Carousel.Slide({ children: ['Slide 1'] });
        const prev = Carousel.Previous({ children: ['Prev'] });
        const next = Carousel.Next({ children: ['Next'] });
        return [s1, prev, next];
      },
    });

    const prevBtn = root.querySelector('[aria-label="Previous slide"]') as HTMLElement;
    const nextBtn = root.querySelector('[aria-label="Next slide"]') as HTMLElement;
    expect(prevBtn.classList.contains(styles.prevButton)).toBe(true);
    expect(nextBtn.classList.contains(styles.nextButton)).toBe(true);
  });

  it('preserves navigation behavior', () => {
    const root = Carousel({
      children: () => {
        const s1 = Carousel.Slide({ children: ['S1'] });
        const s2 = Carousel.Slide({ children: ['S2'] });
        const prev = Carousel.Previous({ children: ['Prev'] });
        const next = Carousel.Next({ children: ['Next'] });
        return [s1, s2, prev, next];
      },
    });

    const nextBtn = root.querySelector('[aria-label="Next slide"]') as HTMLButtonElement;
    nextBtn.click();

    const slides = root.querySelectorAll('[role="group"]');
    expect(slides[0]?.getAttribute('data-state')).toBe('inactive');
    expect(slides[1]?.getAttribute('data-state')).toBe('active');
  });
});
