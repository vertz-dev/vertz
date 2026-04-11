import { afterEach, beforeEach, describe, expect, it, mock } from '@vertz/test';
import { ComposedCarousel } from '../carousel-composed';

function renderCarousel(
  slides: string[],
  opts: {
    orientation?: 'horizontal' | 'vertical';
    loop?: boolean;
    defaultIndex?: number;
    onSlideChange?: (index: number) => void;
  } = {},
): HTMLElement {
  return ComposedCarousel({
    ...opts,
    children: () => {
      const slideEls = slides.map((text) => ComposedCarousel.Slide({ children: [text] }));
      const prev = ComposedCarousel.Previous({ children: ['Prev'] });
      const next = ComposedCarousel.Next({ children: ['Next'] });
      return [...slideEls, prev, next];
    },
  });
}

describe('Composed Carousel', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a Carousel with Slide sub-components', () => {
    describe('When rendered', () => {
      it('Then root has role="region" and aria-roledescription="carousel"', () => {
        const root = renderCarousel(['Slide 1']);
        container.appendChild(root);

        expect(root.getAttribute('role')).toBe('region');
        expect(root.getAttribute('aria-roledescription')).toBe('carousel');
      });

      it('Then slides have role="group" and aria-roledescription="slide"', () => {
        const root = renderCarousel(['Slide 1', 'Slide 2']);
        container.appendChild(root);

        const slides = root.querySelectorAll('[role="group"]');
        expect(slides.length).toBe(2);
        for (const slide of slides) {
          expect(slide.getAttribute('aria-roledescription')).toBe('slide');
        }
      });

      it('Then the first slide is active and others are hidden', () => {
        const root = renderCarousel(['Slide 1', 'Slide 2', 'Slide 3']);
        container.appendChild(root);

        const slides = root.querySelectorAll('[role="group"]');
        expect(slides[0]?.getAttribute('aria-hidden')).toBe('false');
        expect(slides[0]?.getAttribute('data-state')).toBe('active');
        expect(slides[1]?.getAttribute('aria-hidden')).toBe('true');
        expect(slides[1]?.getAttribute('data-state')).toBe('inactive');
        expect(slides[2]?.getAttribute('aria-hidden')).toBe('true');
        expect(slides[2]?.getAttribute('data-state')).toBe('inactive');
      });

      it('Then slides have "Slide N of M" labels', () => {
        const root = renderCarousel(['Slide 1', 'Slide 2']);
        container.appendChild(root);

        const slides = root.querySelectorAll('[role="group"]');
        expect(slides[0]?.getAttribute('aria-label')).toBe('Slide 1 of 2');
        expect(slides[1]?.getAttribute('aria-label')).toBe('Slide 2 of 2');
      });

      it('Then renders slide content inside each slide', () => {
        const root = renderCarousel(['Hello', 'World']);
        container.appendChild(root);

        const slides = root.querySelectorAll('[role="group"]');
        expect(slides[0]?.textContent).toBe('Hello');
        expect(slides[1]?.textContent).toBe('World');
      });

      it('Then defaults data-orientation to horizontal', () => {
        const root = renderCarousel(['Slide 1']);
        expect(root.getAttribute('data-orientation')).toBe('horizontal');
      });

      it('Then sets data-orientation to vertical when specified', () => {
        const root = renderCarousel(['Slide 1'], { orientation: 'vertical' });
        expect(root.getAttribute('data-orientation')).toBe('vertical');
      });
    });
  });

  describe('Given a Carousel with next/prev buttons', () => {
    describe('When the next button is clicked', () => {
      it('Then advances to the next slide', () => {
        const root = renderCarousel(['S1', 'S2', 'S3']);
        container.appendChild(root);

        const nextBtn = root.querySelector('[aria-label="Next slide"]') as HTMLButtonElement;
        nextBtn.click();

        const slides = root.querySelectorAll('[role="group"]');
        expect(slides[0]?.getAttribute('data-state')).toBe('inactive');
        expect(slides[1]?.getAttribute('data-state')).toBe('active');
        expect(slides[1]?.getAttribute('aria-hidden')).toBe('false');
      });
    });

    describe('When the prev button is clicked', () => {
      it('Then goes to the previous slide', () => {
        const root = renderCarousel(['S1', 'S2', 'S3']);
        container.appendChild(root);

        const nextBtn = root.querySelector('[aria-label="Next slide"]') as HTMLButtonElement;
        const prevBtn = root.querySelector('[aria-label="Previous slide"]') as HTMLButtonElement;

        nextBtn.click();
        nextBtn.click();
        prevBtn.click();

        const slides = root.querySelectorAll('[role="group"]');
        expect(slides[1]?.getAttribute('data-state')).toBe('active');
        expect(slides[2]?.getAttribute('data-state')).toBe('inactive');
      });
    });
  });

  describe('Given a Carousel without loop mode', () => {
    it('Then prev is disabled at start and next is disabled at end', () => {
      const root = renderCarousel(['S1', 'S2']);
      container.appendChild(root);

      const prevBtn = root.querySelector('[aria-label="Previous slide"]') as HTMLButtonElement;
      const nextBtn = root.querySelector('[aria-label="Next slide"]') as HTMLButtonElement;

      expect(prevBtn.disabled).toBe(true);
      expect(nextBtn.disabled).toBe(false);

      nextBtn.click();
      expect(prevBtn.disabled).toBe(false);
      expect(nextBtn.disabled).toBe(true);
    });
  });

  describe('Given a Carousel with loop mode', () => {
    it('Then wraps from last to first and first to last', () => {
      const root = renderCarousel(['S1', 'S2', 'S3'], { loop: true });
      container.appendChild(root);

      const nextBtn = root.querySelector('[aria-label="Next slide"]') as HTMLButtonElement;
      const prevBtn = root.querySelector('[aria-label="Previous slide"]') as HTMLButtonElement;

      // Go to end: 0 -> 1 -> 2 -> 0
      nextBtn.click();
      nextBtn.click();
      nextBtn.click();
      const slides = root.querySelectorAll('[role="group"]');
      expect(slides[0]?.getAttribute('data-state')).toBe('active');

      // Wrap backward: 0 -> 2
      prevBtn.click();
      expect(slides[2]?.getAttribute('data-state')).toBe('active');
    });

    it('Then buttons are never disabled', () => {
      const root = renderCarousel(['S1', 'S2'], { loop: true });
      container.appendChild(root);

      const prevBtn = root.querySelector('[aria-label="Previous slide"]') as HTMLButtonElement;
      const nextBtn = root.querySelector('[aria-label="Next slide"]') as HTMLButtonElement;

      expect(prevBtn.disabled).toBe(false);
      expect(nextBtn.disabled).toBe(false);
    });
  });

  describe('Given a Carousel with keyboard navigation', () => {
    it('Then ArrowRight navigates to next slide (horizontal)', () => {
      const root = renderCarousel(['S1', 'S2']);
      container.appendChild(root);

      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      const slides = root.querySelectorAll('[role="group"]');
      expect(slides[1]?.getAttribute('data-state')).toBe('active');
    });

    it('Then ArrowLeft navigates to previous slide (horizontal)', () => {
      const root = renderCarousel(['S1', 'S2']);
      container.appendChild(root);

      const nextBtn = root.querySelector('[aria-label="Next slide"]') as HTMLButtonElement;
      nextBtn.click();

      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

      const slides = root.querySelectorAll('[role="group"]');
      expect(slides[0]?.getAttribute('data-state')).toBe('active');
    });

    it('Then ArrowDown/ArrowUp navigate slides in vertical orientation', () => {
      const root = renderCarousel(['S1', 'S2', 'S3'], { orientation: 'vertical' });
      container.appendChild(root);

      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      const slides = root.querySelectorAll('[role="group"]');
      expect(slides[1]?.getAttribute('data-state')).toBe('active');

      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(slides[0]?.getAttribute('data-state')).toBe('active');
    });

    it('Then keyboard loop wraps from last to first (horizontal)', () => {
      const root = renderCarousel(['S1', 'S2', 'S3'], { loop: true });
      container.appendChild(root);

      // Navigate to last slide: 0 -> 1 -> 2
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      // Wrap: 2 -> 0
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      const slides = root.querySelectorAll('[role="group"]');
      expect(slides[0]?.getAttribute('data-state')).toBe('active');
    });

    it('Then keyboard loop wraps from first to last (horizontal)', () => {
      const root = renderCarousel(['S1', 'S2', 'S3'], { loop: true });
      container.appendChild(root);

      // Wrap backward: 0 -> 2
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

      const slides = root.querySelectorAll('[role="group"]');
      expect(slides[2]?.getAttribute('data-state')).toBe('active');
    });

    it('Then keyboard loop wraps from last to first (vertical)', () => {
      const root = renderCarousel(['S1', 'S2', 'S3'], {
        orientation: 'vertical',
        loop: true,
      });
      container.appendChild(root);

      // Navigate to last: 0 -> 1 -> 2
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      // Wrap: 2 -> 0
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      const slides = root.querySelectorAll('[role="group"]');
      expect(slides[0]?.getAttribute('data-state')).toBe('active');
    });

    it('Then keyboard loop wraps from first to last (vertical)', () => {
      const root = renderCarousel(['S1', 'S2', 'S3'], {
        orientation: 'vertical',
        loop: true,
      });
      container.appendChild(root);

      // Wrap backward: 0 -> 2
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

      const slides = root.querySelectorAll('[role="group"]');
      expect(slides[2]?.getAttribute('data-state')).toBe('active');
    });

    it('Then keyboard navigation stops at first slide when loop is disabled (horizontal)', () => {
      const onSlideChange = mock();
      const root = renderCarousel(['S1', 'S2', 'S3'], { onSlideChange });
      container.appendChild(root);

      // Already at first slide, ArrowLeft should not change anything
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

      const slides = root.querySelectorAll('[role="group"]');
      expect(slides[0]?.getAttribute('data-state')).toBe('active');
      expect(onSlideChange).not.toHaveBeenCalled();
    });

    it('Then keyboard navigation stops at last slide when loop is disabled (horizontal)', () => {
      const onSlideChange = mock();
      const root = renderCarousel(['S1', 'S2', 'S3'], { onSlideChange });
      container.appendChild(root);

      // Navigate to last slide: 0 -> 1 -> 2
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      onSlideChange.mockClear();

      // Already at last slide, ArrowRight should not change anything
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      const slides = root.querySelectorAll('[role="group"]');
      expect(slides[2]?.getAttribute('data-state')).toBe('active');
      expect(onSlideChange).not.toHaveBeenCalled();
    });

    it('Then keyboard navigation stops at first slide when loop is disabled (vertical)', () => {
      const onSlideChange = mock();
      const root = renderCarousel(['S1', 'S2', 'S3'], {
        orientation: 'vertical',
        onSlideChange,
      });
      container.appendChild(root);

      // Already at first slide, ArrowUp should not change anything
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

      const slides = root.querySelectorAll('[role="group"]');
      expect(slides[0]?.getAttribute('data-state')).toBe('active');
      expect(onSlideChange).not.toHaveBeenCalled();
    });

    it('Then keyboard navigation stops at last slide when loop is disabled (vertical)', () => {
      const onSlideChange = mock();
      const root = renderCarousel(['S1', 'S2', 'S3'], {
        orientation: 'vertical',
        onSlideChange,
      });
      container.appendChild(root);

      // Navigate to last slide: 0 -> 1 -> 2
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      onSlideChange.mockClear();

      // Already at last slide, ArrowDown should not change anything
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      const slides = root.querySelectorAll('[role="group"]');
      expect(slides[2]?.getAttribute('data-state')).toBe('active');
      expect(onSlideChange).not.toHaveBeenCalled();
    });

    it('Then cross-axis keys are ignored in horizontal orientation', () => {
      const onSlideChange = mock();
      const root = renderCarousel(['S1', 'S2', 'S3'], { onSlideChange });
      container.appendChild(root);

      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      const slides = root.querySelectorAll('[role="group"]');
      expect(slides[0]?.getAttribute('data-state')).toBe('active');
      expect(onSlideChange).not.toHaveBeenCalled();
    });

    it('Then cross-axis keys are ignored in vertical orientation', () => {
      const onSlideChange = mock();
      const root = renderCarousel(['S1', 'S2', 'S3'], {
        orientation: 'vertical',
        onSlideChange,
      });
      container.appendChild(root);

      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      const slides = root.querySelectorAll('[role="group"]');
      expect(slides[0]?.getAttribute('data-state')).toBe('active');
      expect(onSlideChange).not.toHaveBeenCalled();
    });

    it('Then keyboard navigation triggers onSlideChange', () => {
      const onSlideChange = mock();
      const root = renderCarousel(['S1', 'S2', 'S3'], { onSlideChange });
      container.appendChild(root);

      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      expect(onSlideChange).toHaveBeenCalledTimes(1);
      expect(onSlideChange).toHaveBeenCalledWith(1);
    });

    it('Then keyboard loop wrap triggers onSlideChange', () => {
      const onSlideChange = mock();
      const root = renderCarousel(['S1', 'S2', 'S3'], { loop: true, onSlideChange });
      container.appendChild(root);

      // Wrap backward: 0 -> 2
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

      expect(onSlideChange).toHaveBeenCalledTimes(1);
      expect(onSlideChange).toHaveBeenCalledWith(2);
    });
  });

  describe('Given a Carousel with an onSlideChange callback', () => {
    it('Then calls onSlideChange when slide changes', () => {
      const onSlideChange = mock();
      const root = renderCarousel(['S1', 'S2'], { onSlideChange });
      container.appendChild(root);

      const nextBtn = root.querySelector('[aria-label="Next slide"]') as HTMLButtonElement;
      nextBtn.click();

      expect(onSlideChange).toHaveBeenCalledTimes(1);
      expect(onSlideChange).toHaveBeenCalledWith(1);
    });
  });

  describe('Given a Carousel with defaultIndex', () => {
    it('Then starts at the specified slide index', () => {
      const root = renderCarousel(['S1', 'S2', 'S3'], { defaultIndex: 1 });
      container.appendChild(root);

      const slides = root.querySelectorAll('[role="group"]');
      expect(slides[0]?.getAttribute('data-state')).toBe('inactive');
      expect(slides[1]?.getAttribute('data-state')).toBe('active');
      expect(slides[2]?.getAttribute('data-state')).toBe('inactive');
    });
  });

  describe('Given a Carousel with classes', () => {
    it('Then applies classes to root, viewport, slides, and buttons', () => {
      const root = ComposedCarousel({
        classes: {
          root: 'carousel-root',
          viewport: 'carousel-viewport',
          slide: 'carousel-slide',
          prevButton: 'carousel-prev',
          nextButton: 'carousel-next',
        },
        children: () => {
          const s1 = ComposedCarousel.Slide({ children: ['Slide 1'] });
          const prev = ComposedCarousel.Previous({ children: ['Prev'] });
          const next = ComposedCarousel.Next({ children: ['Next'] });
          return [s1, prev, next];
        },
      });
      container.appendChild(root);

      expect(root.classList.contains('carousel-root')).toBe(true);

      const viewport = root.querySelector('[data-carousel-viewport]') as HTMLElement;
      expect(viewport.classList.contains('carousel-viewport')).toBe(true);

      const slide = root.querySelector('[role="group"]') as HTMLElement;
      expect(slide.classList.contains('carousel-slide')).toBe(true);

      const prevBtn = root.querySelector('[aria-label="Previous slide"]') as HTMLElement;
      expect(prevBtn.classList.contains('carousel-prev')).toBe(true);

      const nextBtn = root.querySelector('[aria-label="Next slide"]') as HTMLElement;
      expect(nextBtn.classList.contains('carousel-next')).toBe(true);
    });
  });

  describe('Given a Carousel with custom Previous/Next content', () => {
    it('Then renders custom content inside buttons', () => {
      const root = ComposedCarousel({
        children: () => {
          const s1 = ComposedCarousel.Slide({ children: ['Slide 1'] });
          const prev = ComposedCarousel.Previous({ children: ['← Back'] });
          const next = ComposedCarousel.Next({ children: ['Forward →'] });
          return [s1, prev, next];
        },
      });
      container.appendChild(root);

      const prevBtn = root.querySelector('[aria-label="Previous slide"]') as HTMLElement;
      const nextBtn = root.querySelector('[aria-label="Next slide"]') as HTMLElement;
      expect(prevBtn.textContent).toBe('← Back');
      expect(nextBtn.textContent).toBe('Forward →');
    });
  });

  describe('Given a Carousel.Slide used outside Carousel', () => {
    it('Then throws an error', () => {
      expect(() => {
        ComposedCarousel.Slide({ children: ['Slide 1'] });
      }).toThrow('must be used inside <Carousel>');
    });
  });

  describe('Given a Carousel with slide visibility', () => {
    it('Then active slide is visible and inactive slides are hidden via data-state', () => {
      const root = renderCarousel(['S1', 'S2', 'S3'], { defaultIndex: 1 });
      container.appendChild(root);

      const slides = root.querySelectorAll('[role="group"]');
      expect(slides[0]?.getAttribute('data-state')).toBe('inactive');
      expect(slides[1]?.getAttribute('data-state')).toBe('active');
      expect(slides[2]?.getAttribute('data-state')).toBe('inactive');
    });
  });
});
