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
  const ThemedCarousel = createThemedCarousel({
    root: styles.root,
    viewport: styles.viewport,
    slide: styles.slide,
    prevButton: styles.prevButton,
    nextButton: styles.nextButton,
  });

  it('applies root class', () => {
    const { root } = ThemedCarousel();
    expect(root.classList.contains(styles.root)).toBe(true);
  });

  it('applies viewport class', () => {
    const { viewport } = ThemedCarousel();
    expect(viewport.classList.contains(styles.viewport)).toBe(true);
  });

  it('applies button classes', () => {
    const { prevButton, nextButton } = ThemedCarousel();
    expect(prevButton.classList.contains(styles.prevButton)).toBe(true);
    expect(nextButton.classList.contains(styles.nextButton)).toBe(true);
  });

  it('applies slide class to created slides', () => {
    const { Slide } = ThemedCarousel();
    const slide = Slide();
    expect(slide.classList.contains(styles.slide)).toBe(true);
  });

  it('preserves primitive behavior', () => {
    const { state, Slide, nextButton } = ThemedCarousel();
    Slide();
    Slide();

    expect(state.currentIndex.peek()).toBe(0);
    nextButton.click();
    expect(state.currentIndex.peek()).toBe(1);
  });
});
