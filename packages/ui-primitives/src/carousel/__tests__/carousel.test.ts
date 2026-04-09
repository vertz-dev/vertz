import { afterEach, beforeEach, describe, expect, it, vi } from '@vertz/test';
import { Carousel } from '../carousel';

describe('Carousel', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('root has role="region" and aria-roledescription="carousel"', () => {
    const { root } = Carousel.Root();
    expect(root.getAttribute('role')).toBe('region');
    expect(root.getAttribute('aria-roledescription')).toBe('carousel');
  });

  it('slides have role="group" and aria-roledescription="slide"', () => {
    const { Slide, viewport } = Carousel.Root();
    const slide = Slide();
    viewport.appendChild(slide);
    expect(slide.getAttribute('role')).toBe('group');
    expect(slide.getAttribute('aria-roledescription')).toBe('slide');
  });

  it('Slide factory creates and tracks slides', () => {
    const { state, Slide, viewport } = Carousel.Root();
    expect(state.slideCount.peek()).toBe(0);

    const s1 = Slide();
    viewport.appendChild(s1);
    expect(state.slideCount.peek()).toBe(1);
    expect(viewport.contains(s1)).toBe(true);

    const s2 = Slide();
    viewport.appendChild(s2);
    expect(state.slideCount.peek()).toBe(2);
    expect(viewport.contains(s2)).toBe(true);
  });

  it('current slide is active, others have aria-hidden="true"', () => {
    const { Slide, viewport } = Carousel.Root();
    const s1 = Slide();
    viewport.appendChild(s1);
    const s2 = Slide();
    viewport.appendChild(s2);
    const s3 = Slide();
    viewport.appendChild(s3);

    expect(s1.getAttribute('aria-hidden')).toBe('false');
    expect(s1.getAttribute('data-state')).toBe('active');
    expect(s2.getAttribute('aria-hidden')).toBe('true');
    expect(s2.getAttribute('data-state')).toBe('inactive');
    expect(s3.getAttribute('aria-hidden')).toBe('true');
    expect(s3.getAttribute('data-state')).toBe('inactive');
  });

  it('slides have "Slide N of M" labels', () => {
    const { Slide, viewport } = Carousel.Root();
    const s1 = Slide();
    viewport.appendChild(s1);
    const s2 = Slide();
    viewport.appendChild(s2);

    expect(s1.getAttribute('aria-label')).toBe('Slide 1 of 2');
    expect(s2.getAttribute('aria-label')).toBe('Slide 2 of 2');
  });

  it('next button advances to next slide', () => {
    const { state, Slide, nextButton, viewport } = Carousel.Root();
    viewport.appendChild(Slide());
    viewport.appendChild(Slide());
    viewport.appendChild(Slide());

    expect(state.currentIndex.peek()).toBe(0);
    nextButton.click();
    expect(state.currentIndex.peek()).toBe(1);
    nextButton.click();
    expect(state.currentIndex.peek()).toBe(2);
  });

  it('prev button goes to previous slide', () => {
    const { state, Slide, nextButton, prevButton, viewport } = Carousel.Root();
    viewport.appendChild(Slide());
    viewport.appendChild(Slide());
    viewport.appendChild(Slide());

    nextButton.click();
    nextButton.click();
    expect(state.currentIndex.peek()).toBe(2);

    prevButton.click();
    expect(state.currentIndex.peek()).toBe(1);
  });

  it('prev disabled at start and next disabled at end (no loop)', () => {
    const { Slide, prevButton, nextButton, viewport } = Carousel.Root();
    viewport.appendChild(Slide());
    viewport.appendChild(Slide());

    // At start: prev disabled, next enabled
    expect(prevButton.disabled).toBe(true);
    expect(nextButton.disabled).toBe(false);

    // Go to end
    nextButton.click();
    expect(prevButton.disabled).toBe(false);
    expect(nextButton.disabled).toBe(true);
  });

  it('loop mode wraps from last to first and first to last', () => {
    const { state, Slide, nextButton, prevButton, viewport } = Carousel.Root({ loop: true });
    viewport.appendChild(Slide());
    viewport.appendChild(Slide());
    viewport.appendChild(Slide());

    // Wrap forward: 0 -> 1 -> 2 -> 0
    nextButton.click();
    nextButton.click();
    expect(state.currentIndex.peek()).toBe(2);
    nextButton.click();
    expect(state.currentIndex.peek()).toBe(0);

    // Wrap backward: 0 -> 2
    prevButton.click();
    expect(state.currentIndex.peek()).toBe(2);
  });

  it('loop mode does not disable buttons', () => {
    const { Slide, prevButton, nextButton, viewport } = Carousel.Root({ loop: true });
    viewport.appendChild(Slide());
    viewport.appendChild(Slide());

    expect(prevButton.disabled).toBe(false);
    expect(nextButton.disabled).toBe(false);
  });

  it('ArrowRight navigates to next slide (horizontal)', () => {
    const { root, state, Slide, viewport } = Carousel.Root();
    container.appendChild(root);
    viewport.appendChild(Slide());
    viewport.appendChild(Slide());

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(state.currentIndex.peek()).toBe(1);
  });

  it('ArrowLeft navigates to previous slide (horizontal)', () => {
    const { root, state, Slide, nextButton, viewport } = Carousel.Root();
    container.appendChild(root);
    viewport.appendChild(Slide());
    viewport.appendChild(Slide());

    nextButton.click();
    expect(state.currentIndex.peek()).toBe(1);

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(state.currentIndex.peek()).toBe(0);
  });

  it('ArrowDown/ArrowUp navigate slides in vertical orientation', () => {
    const { root, state, Slide, viewport } = Carousel.Root({ orientation: 'vertical' });
    container.appendChild(root);
    viewport.appendChild(Slide());
    viewport.appendChild(Slide());
    viewport.appendChild(Slide());

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(state.currentIndex.peek()).toBe(1);

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(state.currentIndex.peek()).toBe(0);
  });

  it('calls onSlideChange when slide changes', () => {
    const onSlideChange = vi.fn();
    const { Slide, nextButton, viewport } = Carousel.Root({ onSlideChange });
    viewport.appendChild(Slide());
    viewport.appendChild(Slide());

    nextButton.click();
    expect(onSlideChange).toHaveBeenCalledTimes(1);
    expect(onSlideChange).toHaveBeenCalledWith(1);
  });

  it('sets data-orientation attribute', () => {
    const { root } = Carousel.Root({ orientation: 'vertical' });
    expect(root.getAttribute('data-orientation')).toBe('vertical');
  });

  it('defaults data-orientation to horizontal', () => {
    const { root } = Carousel.Root();
    expect(root.getAttribute('data-orientation')).toBe('horizontal');
  });
});
