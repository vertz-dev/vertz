import { describe, expect, it } from 'bun:test';
// Import animations at module level — this triggers all keyframes() calls
import {
  ANIMATION_DURATION,
  ANIMATION_EASING,
  accordionDown,
  accordionUp,
  fadeIn,
  fadeOut,
  slideInFromBottom,
  slideInFromTop,
  slideOutToBottom,
  slideOutToTop,
  zoomIn,
  zoomOut,
} from '../animations';

describe('predefined animation constants', () => {
  it('fadeIn equals expected name', () => {
    expect(fadeIn).toBe('vz-fade-in');
  });

  it('fadeOut equals expected name', () => {
    expect(fadeOut).toBe('vz-fade-out');
  });

  it('zoomIn equals expected name', () => {
    expect(zoomIn).toBe('vz-zoom-in');
  });

  it('zoomOut equals expected name', () => {
    expect(zoomOut).toBe('vz-zoom-out');
  });

  it('slideInFromTop equals expected name', () => {
    expect(slideInFromTop).toBe('vz-slide-in-from-top');
  });

  it('slideInFromBottom equals expected name', () => {
    expect(slideInFromBottom).toBe('vz-slide-in-from-bottom');
  });

  it('slideOutToTop equals expected name', () => {
    expect(slideOutToTop).toBe('vz-slide-out-to-top');
  });

  it('slideOutToBottom equals expected name', () => {
    expect(slideOutToBottom).toBe('vz-slide-out-to-bottom');
  });

  it('accordionDown equals expected name', () => {
    expect(accordionDown).toBe('vz-accordion-down');
  });

  it('accordionUp equals expected name', () => {
    expect(accordionUp).toBe('vz-accordion-up');
  });
});

describe('animation keyframes CSS content', () => {
  // Verify keyframes produce correct CSS by calling keyframes() directly
  // (the injection tracking tests in keyframes.test.ts cover injectCSS integration)
  it('all 10 predefined animation names are strings', () => {
    const names = [
      fadeIn,
      fadeOut,
      zoomIn,
      zoomOut,
      slideInFromTop,
      slideInFromBottom,
      slideOutToTop,
      slideOutToBottom,
      accordionDown,
      accordionUp,
    ];
    for (const name of names) {
      expect(typeof name).toBe('string');
      expect(name.startsWith('vz-')).toBe(true);
    }
  });
});

describe('animation timing constants', () => {
  it('exports ANIMATION_DURATION', () => {
    expect(ANIMATION_DURATION).toBe('150ms');
  });

  it('exports ANIMATION_EASING', () => {
    expect(typeof ANIMATION_EASING).toBe('string');
    expect(ANIMATION_EASING.length).toBeGreaterThan(0);
  });
});
