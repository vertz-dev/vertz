/**
 * Composed ScrollArea — declarative JSX component with custom scrollbars.
 * Wraps content with overflow scrolling and optional styled scrollbar tracks/thumbs.
 */

import type { ChildValue } from '@vertz/ui';
import { ref } from '@vertz/ui';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface ScrollAreaClasses {
  root?: string;
  viewport?: string;
  scrollbar?: string;
  thumb?: string;
}

export type ScrollAreaClassKey = keyof ScrollAreaClasses;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ComposedScrollAreaProps {
  children?: ChildValue;
  classes?: ScrollAreaClasses;
  orientation?: 'vertical' | 'horizontal' | 'both';
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function ComposedScrollAreaRoot({
  children,
  classes,
  orientation = 'vertical',
}: ComposedScrollAreaProps) {
  const viewportRef = ref<HTMLDivElement>();
  const scrollbarYRef = ref<HTMLDivElement>();
  const scrollbarXRef = ref<HTMLDivElement>();
  const thumbYRef = ref<HTMLDivElement>();
  const thumbXRef = ref<HTMLDivElement>();

  // Dragging state
  let isDraggingY = false;
  let startY = 0;
  let startScrollTop = 0;
  let isDraggingX = false;
  let startX = 0;
  let startScrollLeft = 0;

  function syncThumbY(): void {
    const vp = viewportRef.current;
    const thumb = thumbYRef.current;
    if (!vp || !thumb) return;

    const { scrollTop, scrollHeight, clientHeight } = vp;
    if (scrollHeight <= clientHeight) {
      thumb.style.height = '0';
      return;
    }
    const ratio = clientHeight / scrollHeight;
    thumb.style.height = `${ratio * 100}%`;
    const scrollRatio = scrollTop / (scrollHeight - clientHeight);
    thumb.style.transform = `translateY(${scrollRatio * (1 / ratio - 1) * 100}%)`;
  }

  function syncThumbX(): void {
    const vp = viewportRef.current;
    const thumb = thumbXRef.current;
    if (!vp || !thumb) return;

    const { scrollLeft, scrollWidth, clientWidth } = vp;
    if (scrollWidth <= clientWidth) {
      thumb.style.width = '0';
      return;
    }
    const ratio = clientWidth / scrollWidth;
    thumb.style.width = `${ratio * 100}%`;
    const scrollRatio = scrollLeft / (scrollWidth - clientWidth);
    thumb.style.transform = `translateX(${scrollRatio * (1 / ratio - 1) * 100}%)`;
  }

  function handleViewportScroll(): void {
    if (orientation === 'vertical' || orientation === 'both') syncThumbY();
    if (orientation === 'horizontal' || orientation === 'both') syncThumbX();
  }

  // Y thumb drag handlers
  function handleThumbYDown(e: PointerEvent): void {
    const vp = viewportRef.current;
    const thumb = thumbYRef.current;
    if (!vp || !thumb) return;
    isDraggingY = true;
    startY = e.clientY;
    startScrollTop = vp.scrollTop;
    thumb.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function handleThumbYMove(e: PointerEvent): void {
    if (!isDraggingY) return;
    const vp = viewportRef.current;
    const scrollbar = scrollbarYRef.current;
    if (!vp || !scrollbar) return;
    const delta = e.clientY - startY;
    const scrollbarHeight = scrollbar.clientHeight;
    const scrollRange = vp.scrollHeight - vp.clientHeight;
    if (scrollbarHeight > 0) {
      vp.scrollTop = startScrollTop + (delta / scrollbarHeight) * scrollRange;
    }
  }

  function handleThumbYUp(e: PointerEvent): void {
    isDraggingY = false;
    const thumb = thumbYRef.current;
    if (thumb) thumb.releasePointerCapture(e.pointerId);
  }

  // X thumb drag handlers
  function handleThumbXDown(e: PointerEvent): void {
    const vp = viewportRef.current;
    const thumb = thumbXRef.current;
    if (!vp || !thumb) return;
    isDraggingX = true;
    startX = e.clientX;
    startScrollLeft = vp.scrollLeft;
    thumb.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function handleThumbXMove(e: PointerEvent): void {
    if (!isDraggingX) return;
    const vp = viewportRef.current;
    const scrollbar = scrollbarXRef.current;
    if (!vp || !scrollbar) return;
    const delta = e.clientX - startX;
    const scrollbarWidth = scrollbar.clientWidth;
    const scrollRange = vp.scrollWidth - vp.clientWidth;
    if (scrollbarWidth > 0) {
      vp.scrollLeft = startScrollLeft + (delta / scrollbarWidth) * scrollRange;
    }
  }

  function handleThumbXUp(e: PointerEvent): void {
    isDraggingX = false;
    const thumb = thumbXRef.current;
    if (thumb) thumb.releasePointerCapture(e.pointerId);
  }

  const showY = orientation === 'vertical' || orientation === 'both';
  const showX = orientation === 'horizontal' || orientation === 'both';

  return (
    <div
      data-part="scroll-area"
      style={{ position: 'relative', overflow: 'hidden' }}
      class={classes?.root || undefined}
    >
      <div
        ref={viewportRef}
        data-part="scroll-area-viewport"
        style={{ overflow: 'scroll', scrollbarWidth: 'none' }}
        class={classes?.viewport || undefined}
        onScroll={handleViewportScroll}
      >
        <div data-part="scroll-area-content">{children}</div>
      </div>
      {showY && (
        <div
          ref={scrollbarYRef}
          data-part="scroll-area-scrollbar"
          aria-hidden="true"
          data-orientation="vertical"
          class={classes?.scrollbar || undefined}
        >
          <div
            ref={thumbYRef}
            data-part="scroll-area-thumb"
            class={classes?.thumb || undefined}
            onPointerdown={handleThumbYDown}
            onPointermove={handleThumbYMove}
            onPointerup={handleThumbYUp}
          />
        </div>
      )}
      {showX && (
        <div
          ref={scrollbarXRef}
          data-part="scroll-area-scrollbar"
          aria-hidden="true"
          data-orientation="horizontal"
          class={classes?.scrollbar || undefined}
        >
          <div
            ref={thumbXRef}
            data-part="scroll-area-thumb"
            class={classes?.thumb || undefined}
            onPointerdown={handleThumbXDown}
            onPointermove={handleThumbXMove}
            onPointerup={handleThumbXUp}
          />
        </div>
      )}
    </div>
  ) as HTMLElement;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedScrollArea = ComposedScrollAreaRoot as ((
  props: ComposedScrollAreaProps,
) => HTMLElement) & {
  __classKeys?: ScrollAreaClassKey;
};
