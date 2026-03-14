/**
 * Spatial hit testing for NativeElement trees.
 *
 * Given a point (x, y) and a layout map, finds the deepest
 * element whose bounds contain the point. Elements are tested
 * in reverse draw order (last child = front-most).
 */

import type { ComputedLayout } from '../layout/layout';
import type { NativeElement } from '../native-element';

/**
 * Find the deepest NativeElement at the given pixel coordinates.
 *
 * Traverses the element tree in reverse child order (back-to-front)
 * so the front-most visible element is returned first.
 *
 * Returns null if no element contains the point.
 */
export function hitTest(
  x: number,
  y: number,
  layouts: Map<NativeElement, ComputedLayout>,
): NativeElement | null {
  let result: NativeElement | null = null;
  let bestDepth = -1;

  for (const [el, layout] of layouts) {
    if (
      x >= layout.x &&
      x < layout.x + layout.width &&
      y >= layout.y &&
      y < layout.y + layout.height
    ) {
      const depth = getDepth(el);
      if (depth > bestDepth) {
        bestDepth = depth;
        result = el;
      }
    }
  }

  return result;
}

function getDepth(el: NativeElement): number {
  let depth = 0;
  let current = el.parent;
  while (current) {
    depth++;
    current = current.parent;
  }
  return depth;
}
