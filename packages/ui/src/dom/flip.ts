/**
 * FLIP animation utilities for list reconciliation.
 *
 * FLIP = First, Last, Invert, Play:
 * 1. First: snapshot element positions before DOM mutation
 * 2. Last: DOM mutations happen (reorder, add, remove)
 * 3. Invert: apply transform to put elements back in old positions
 * 4. Play: animate to new positions by clearing transform
 */

/**
 * Snapshot bounding rects for all Element nodes in the map.
 * Non-Element nodes (text, comment) are skipped.
 */
export function snapshotRects(nodeMap: Map<string | number, Node>): Map<string | number, DOMRect> {
  const rects = new Map<string | number, DOMRect>();
  for (const [key, node] of nodeMap) {
    if (node instanceof Element) {
      rects.set(key, node.getBoundingClientRect());
    }
  }
  return rects;
}

/**
 * Play FLIP animation on an element.
 *
 * Calculates the position delta between first and last rects,
 * applies an inverse transform, then animates to the final position.
 *
 * @param el - The element to animate
 * @param firstRect - Rect captured before DOM mutation
 * @param duration - Animation duration in ms
 * @param easing - CSS easing function
 */
export function flipAnimate(
  el: HTMLElement,
  firstRect: DOMRect,
  duration: number,
  easing: string,
): void {
  const lastRect = el.getBoundingClientRect();
  const deltaX = firstRect.left - lastRect.left;
  const deltaY = firstRect.top - lastRect.top;

  // No movement — skip animation
  if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;

  // Invert: put element in old position
  el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
  el.style.transition = '';

  // Play: animate to new position on next frame
  requestAnimationFrame(() => {
    el.style.transition = `transform ${duration}ms ${easing}`;
    el.style.transform = '';

    const onEnd = () => {
      el.style.transition = '';
      el.removeEventListener('transitionend', onEnd);
    };
    el.addEventListener('transitionend', onEnd, { once: true });
  });
}
