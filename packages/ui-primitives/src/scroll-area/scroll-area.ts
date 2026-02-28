/**
 * ScrollArea primitive - custom scrollable container with styled scrollbars.
 * Provides scroll position signals and thumb-drag interaction.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';

export interface ScrollAreaOptions {
  orientation?: 'vertical' | 'horizontal' | 'both';
  type?: 'auto' | 'always' | 'hover' | 'scroll';
}

export interface ScrollAreaState {
  scrollTop: Signal<number>;
  scrollLeft: Signal<number>;
}

export interface ScrollAreaElements {
  root: HTMLDivElement;
  viewport: HTMLDivElement;
  content: HTMLDivElement;
  scrollbarY: HTMLDivElement;
  thumbY: HTMLDivElement;
  scrollbarX: HTMLDivElement;
  thumbX: HTMLDivElement;
}

export const ScrollArea = {
  Root(options: ScrollAreaOptions = {}): ScrollAreaElements & {
    state: ScrollAreaState;
    update: () => void;
  } {
    const { orientation = 'vertical' } = options;

    const state: ScrollAreaState = {
      scrollTop: signal(0),
      scrollLeft: signal(0),
    };

    const root = document.createElement('div');
    root.style.position = 'relative';
    root.style.overflow = 'hidden';

    const viewport = document.createElement('div');
    viewport.style.overflow = 'scroll';
    viewport.style.scrollbarWidth = 'none';

    const content = document.createElement('div');

    // Vertical scrollbar
    const scrollbarY = document.createElement('div');
    scrollbarY.setAttribute('aria-hidden', 'true');
    scrollbarY.setAttribute('data-orientation', 'vertical');
    const thumbY = document.createElement('div');
    scrollbarY.appendChild(thumbY);

    // Horizontal scrollbar
    const scrollbarX = document.createElement('div');
    scrollbarX.setAttribute('aria-hidden', 'true');
    scrollbarX.setAttribute('data-orientation', 'horizontal');
    const thumbX = document.createElement('div');
    scrollbarX.appendChild(thumbX);

    // Sync thumb position from scroll events
    function syncThumbY(): void {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      if (scrollHeight <= clientHeight) {
        thumbY.style.height = '0';
        return;
      }
      const ratio = clientHeight / scrollHeight;
      thumbY.style.height = `${ratio * 100}%`;
      const scrollRatio = scrollTop / (scrollHeight - clientHeight);
      thumbY.style.transform = `translateY(${scrollRatio * (1 / ratio - 1) * 100}%)`;
      state.scrollTop.value = scrollTop;
    }

    function syncThumbX(): void {
      const { scrollLeft, scrollWidth, clientWidth } = viewport;
      if (scrollWidth <= clientWidth) {
        thumbX.style.width = '0';
        return;
      }
      const ratio = clientWidth / scrollWidth;
      thumbX.style.width = `${ratio * 100}%`;
      const scrollRatio = scrollLeft / (scrollWidth - clientWidth);
      thumbX.style.transform = `translateX(${scrollRatio * (1 / ratio - 1) * 100}%)`;
      state.scrollLeft.value = scrollLeft;
    }

    viewport.addEventListener('scroll', () => {
      if (orientation === 'vertical' || orientation === 'both') syncThumbY();
      if (orientation === 'horizontal' || orientation === 'both') syncThumbX();
    });

    // Thumb drag for vertical
    let isDraggingY = false;
    let startY = 0;
    let startScrollTop = 0;

    thumbY.addEventListener('pointerdown', (e) => {
      isDraggingY = true;
      startY = e.clientY;
      startScrollTop = viewport.scrollTop;
      thumbY.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    thumbY.addEventListener('pointermove', (e) => {
      if (!isDraggingY) return;
      const delta = e.clientY - startY;
      const scrollbarHeight = scrollbarY.clientHeight;
      const scrollRange = viewport.scrollHeight - viewport.clientHeight;
      if (scrollbarHeight > 0) {
        viewport.scrollTop = startScrollTop + (delta / scrollbarHeight) * scrollRange;
      }
    });

    thumbY.addEventListener('pointerup', (e) => {
      isDraggingY = false;
      thumbY.releasePointerCapture(e.pointerId);
    });

    // Thumb drag for horizontal
    let isDraggingX = false;
    let startX = 0;
    let startScrollLeft = 0;

    thumbX.addEventListener('pointerdown', (e) => {
      isDraggingX = true;
      startX = e.clientX;
      startScrollLeft = viewport.scrollLeft;
      thumbX.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    thumbX.addEventListener('pointermove', (e) => {
      if (!isDraggingX) return;
      const delta = e.clientX - startX;
      const scrollbarWidth = scrollbarX.clientWidth;
      const scrollRange = viewport.scrollWidth - viewport.clientWidth;
      if (scrollbarWidth > 0) {
        viewport.scrollLeft = startScrollLeft + (delta / scrollbarWidth) * scrollRange;
      }
    });

    thumbX.addEventListener('pointerup', (e) => {
      isDraggingX = false;
      thumbX.releasePointerCapture(e.pointerId);
    });

    function update(): void {
      syncThumbY();
      syncThumbX();
    }

    // Assemble DOM
    viewport.appendChild(content);
    root.appendChild(viewport);
    if (orientation === 'vertical' || orientation === 'both') root.appendChild(scrollbarY);
    if (orientation === 'horizontal' || orientation === 'both') root.appendChild(scrollbarX);

    return { root, viewport, content, scrollbarY, thumbY, scrollbarX, thumbX, state, update };
  },
};
