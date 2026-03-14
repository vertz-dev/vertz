/**
 * Event system for native UI.
 *
 * Processes raw input state (mouse position, button state) and
 * dispatches normalized events (click, mousedown, mouseup, mousemove,
 * mouseenter, mouseleave) to NativeElements via hit testing.
 *
 * Events bubble from target up through parent chain.
 */

import type { ComputedLayout } from '../layout/layout';
import type { NativeElement } from '../native-element';
import { hitTest } from './hit-test';

interface NativeMouseEvent extends Record<string, unknown> {
  type: string;
  clientX: number;
  clientY: number;
  target: NativeElement;
}

export interface EventSystem {
  /** Process a mouse button press or release at the given position. */
  processMouseButton(x: number, y: number, action: 'press' | 'release'): void;
  /** Process mouse movement to the given position. */
  processMouseMove(x: number, y: number): void;
  /** Update the layout map (e.g. after resize). */
  updateLayouts(layouts: Map<NativeElement, ComputedLayout>): void;
}

/**
 * Create an event system that dispatches events via hit testing.
 */
export function createEventSystem(initialLayouts: Map<NativeElement, ComputedLayout>): EventSystem {
  let layouts = initialLayouts;
  let hoveredElement: NativeElement | null = null;
  let pressedElement: NativeElement | null = null;

  function dispatchWithBubbling(target: NativeElement, event: NativeMouseEvent): void {
    let current: NativeElement | null = target;
    while (current) {
      current.dispatchEvent(event.type, event);
      current = current.parent;
    }
  }

  return {
    processMouseButton(x, y, action) {
      const target = hitTest(x, y, layouts);
      if (!target) return;

      const event: NativeMouseEvent = { type: '', clientX: x, clientY: y, target };

      if (action === 'press') {
        pressedElement = target;
        event.type = 'mousedown';
        dispatchWithBubbling(target, event);
      } else {
        event.type = 'mouseup';
        dispatchWithBubbling(target, event);

        // Click requires press and release on the same element
        if (pressedElement === target) {
          const clickEvent: NativeMouseEvent = {
            type: 'click',
            clientX: x,
            clientY: y,
            target,
          };
          dispatchWithBubbling(target, clickEvent);
        }
        pressedElement = null;
      }
    },

    processMouseMove(x, y) {
      const target = hitTest(x, y, layouts);

      // Handle enter/leave
      if (target !== hoveredElement) {
        if (hoveredElement) {
          hoveredElement.dispatchEvent('mouseleave', {
            type: 'mouseleave',
            clientX: x,
            clientY: y,
            target: hoveredElement,
          });
        }
        if (target) {
          target.dispatchEvent('mouseenter', {
            type: 'mouseenter',
            clientX: x,
            clientY: y,
            target,
          });
        }
        hoveredElement = target;
      }

      // Dispatch mousemove on current target
      if (target) {
        const event: NativeMouseEvent = {
          type: 'mousemove',
          clientX: x,
          clientY: y,
          target,
        };
        dispatchWithBubbling(target, event);
      }
    },

    updateLayouts(newLayouts) {
      layouts = newLayouts;
    },
  };
}
