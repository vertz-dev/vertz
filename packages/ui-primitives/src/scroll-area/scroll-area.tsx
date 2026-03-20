/**
 * ScrollArea primitive - custom scrollable container with styled scrollbars.
 * Provides scroll position signals and thumb-drag interaction.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';

export interface ScrollAreaOptions extends ElementAttrs {
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

function ScrollAreaRoot(options: ScrollAreaOptions = {}): ScrollAreaElements & {
  state: ScrollAreaState;
  update: () => void;
} {
  const { orientation = 'vertical', type: _type, ...attrs } = options;

  const state: ScrollAreaState = {
    scrollTop: signal(0),
    scrollLeft: signal(0),
  };

  let isDraggingY = false;
  let startY = 0;
  let startScrollTop = 0;
  let isDraggingX = false;
  let startX = 0;
  let startScrollLeft = 0;

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

  function update(): void {
    syncThumbY();
    syncThumbX();
  }

  function handleViewportScroll(): void {
    if (orientation === 'vertical' || orientation === 'both') syncThumbY();
    if (orientation === 'horizontal' || orientation === 'both') syncThumbX();
  }

  function handleThumbYDown(e: PointerEvent): void {
    isDraggingY = true;
    startY = e.clientY;
    startScrollTop = viewport.scrollTop;
    thumbY.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function handleThumbYMove(e: PointerEvent): void {
    if (!isDraggingY) return;
    const delta = e.clientY - startY;
    const scrollbarHeight = scrollbarY.clientHeight;
    const scrollRange = viewport.scrollHeight - viewport.clientHeight;
    if (scrollbarHeight > 0) {
      viewport.scrollTop = startScrollTop + (delta / scrollbarHeight) * scrollRange;
    }
  }

  function handleThumbYUp(e: PointerEvent): void {
    isDraggingY = false;
    thumbY.releasePointerCapture(e.pointerId);
  }

  function handleThumbXDown(e: PointerEvent): void {
    isDraggingX = true;
    startX = e.clientX;
    startScrollLeft = viewport.scrollLeft;
    thumbX.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function handleThumbXMove(e: PointerEvent): void {
    if (!isDraggingX) return;
    const delta = e.clientX - startX;
    const scrollbarWidth = scrollbarX.clientWidth;
    const scrollRange = viewport.scrollWidth - viewport.clientWidth;
    if (scrollbarWidth > 0) {
      viewport.scrollLeft = startScrollLeft + (delta / scrollbarWidth) * scrollRange;
    }
  }

  function handleThumbXUp(e: PointerEvent): void {
    isDraggingX = false;
    thumbX.releasePointerCapture(e.pointerId);
  }

  const thumbY = (
    <div
      onPointerdown={handleThumbYDown}
      onPointermove={handleThumbYMove}
      onPointerup={handleThumbYUp}
    />
  ) as HTMLDivElement;

  const scrollbarY = (
    <div aria-hidden="true" data-orientation="vertical">
      {thumbY}
    </div>
  ) as HTMLDivElement;

  const thumbX = (
    <div
      onPointerdown={handleThumbXDown}
      onPointermove={handleThumbXMove}
      onPointerup={handleThumbXUp}
    />
  ) as HTMLDivElement;

  const scrollbarX = (
    <div aria-hidden="true" data-orientation="horizontal">
      {thumbX}
    </div>
  ) as HTMLDivElement;

  const content = (<div />) as HTMLDivElement;

  const viewport = (
    <div style={{ overflow: 'scroll' }} onScroll={handleViewportScroll}>
      {content}
    </div>
  ) as HTMLDivElement;

  viewport.style.scrollbarWidth = 'none';

  const root = (
    <div style={{ position: 'relative', overflow: 'hidden' }}>{viewport}</div>
  ) as HTMLDivElement;

  // Append scrollbars conditionally via imperative DOM
  if (orientation === 'vertical' || orientation === 'both') root.appendChild(scrollbarY);
  if (orientation === 'horizontal' || orientation === 'both') root.appendChild(scrollbarX);

  applyAttrs(root, attrs);

  return { root, viewport, content, scrollbarY, thumbY, scrollbarX, thumbX, state, update };
}

export const ScrollArea: {
  Root: (options?: ScrollAreaOptions) => ScrollAreaElements & {
    state: ScrollAreaState;
    update: () => void;
  };
} = {
  Root: ScrollAreaRoot,
};
