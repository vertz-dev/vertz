/**
 * Shared floating positioning utility wrapping @floating-ui/dom.
 * Handles positioning, auto-update tracking, portal, and data-side/data-align attributes.
 */

import type { Middleware, Placement, Strategy, VirtualElement } from '@floating-ui/dom';
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';

export type { VirtualElement } from '@floating-ui/dom';

export interface FloatingOptions {
  placement?: Placement;
  strategy?: Strategy;
  offset?: number;
  flip?: boolean;
  shift?: boolean;
  middleware?: Middleware[];
  matchReferenceWidth?: boolean;
  portal?: boolean;
}

export interface FloatingResult {
  cleanup: () => void;
  update: () => Promise<void>;
}

/**
 * Position a floating element relative to a reference element.
 * Uses @floating-ui/dom under the hood for robust viewport-aware positioning.
 */
export function createFloatingPosition(
  reference: HTMLElement | VirtualElement,
  floating: HTMLElement,
  options: FloatingOptions = {},
): FloatingResult {
  const {
    placement = 'bottom-start',
    strategy = 'fixed',
    offset: offsetValue = 4,
    flip: enableFlip = true,
    shift: enableShift = true,
    middleware: extraMiddleware = [],
    matchReferenceWidth = false,
    portal = false,
  } = options;

  // Portal: append to document.body
  if (portal && floating.parentElement !== document.body) {
    document.body.appendChild(floating);
  }

  // Build middleware array
  const mw: Middleware[] = [];
  mw.push(offset(offsetValue));
  if (enableFlip) mw.push(flip());
  if (enableShift) mw.push(shift());
  if (matchReferenceWidth) {
    mw.push({
      name: 'matchReferenceWidth',
      fn({ rects }) {
        floating.style.minWidth = `${rects.reference.width}px`;
        return {};
      },
    });
  }
  mw.push(...extraMiddleware);

  function updatePosition(): void {
    computePosition(reference, floating, {
      placement,
      strategy,
      middleware: mw,
    }).then((result) => {
      floating.style.position = result.strategy;
      floating.style.left = `${result.x}px`;
      floating.style.top = `${result.y}px`;

      // Set data-side and data-align from resolved placement
      const [side = 'bottom', align = 'center'] = result.placement.split('-');
      floating.setAttribute('data-side', side);
      floating.setAttribute('data-align', align);
    });
  }

  // Initial position + auto-update for scroll/resize tracking.
  // animationFrame: true polls on every frame for reliable tracking
  // when the floating element is portaled outside the reference's DOM tree.
  const cleanupAutoUpdate = autoUpdate(reference, floating, updatePosition, {
    animationFrame: true,
  });

  return {
    cleanup: cleanupAutoUpdate,
    update(): Promise<void> {
      updatePosition();
      return Promise.resolve();
    },
  };
}

/**
 * Create a virtual element for positioning at mouse coordinates (e.g., context menu).
 */
export function virtualElement(x: number, y: number): VirtualElement {
  return {
    getBoundingClientRect(): DOMRect {
      return {
        x,
        y,
        top: y,
        left: x,
        bottom: y,
        right: x,
        width: 0,
        height: 0,
        toJSON() {
          return this;
        },
      };
    },
  };
}
