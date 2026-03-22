/**
 * Tests for List drag-and-sort functionality.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { ComposedList } from '../list-composed';

// ---------------------------------------------------------------------------
// Helpers — named functions so the Vertz compiler processes JSX
// ---------------------------------------------------------------------------

function RenderSortableList(props: { onReorder: (from: number, to: number) => void }) {
  return (
    <ComposedList sortable={true} onReorder={props.onReorder}>
      <ComposedList.Item>Item A</ComposedList.Item>
      <ComposedList.Item>Item B</ComposedList.Item>
      <ComposedList.Item>Item C</ComposedList.Item>
    </ComposedList>
  );
}

function RenderSortableListWithHandles(props: { onReorder: (from: number, to: number) => void }) {
  return (
    <ComposedList sortable={true} onReorder={props.onReorder}>
      <ComposedList.Item>
        <ComposedList.DragHandle>drag</ComposedList.DragHandle>
        Item A
      </ComposedList.Item>
      <ComposedList.Item>
        <ComposedList.DragHandle>drag</ComposedList.DragHandle>
        Item B
      </ComposedList.Item>
      <ComposedList.Item>
        <ComposedList.DragHandle>drag</ComposedList.DragHandle>
        Item C
      </ComposedList.Item>
    </ComposedList>
  );
}

function RenderAnimatedSortableList(props: { onReorder: (from: number, to: number) => void }) {
  return (
    <ComposedList sortable={true} animate={true} onReorder={props.onReorder}>
      <ComposedList.Item>
        <ComposedList.DragHandle>drag</ComposedList.DragHandle>
        Item A
      </ComposedList.Item>
      <ComposedList.Item>
        <ComposedList.DragHandle>drag</ComposedList.DragHandle>
        Item B
      </ComposedList.Item>
      <ComposedList.Item>
        <ComposedList.DragHandle>drag</ComposedList.DragHandle>
        Item C
      </ComposedList.Item>
    </ComposedList>
  );
}

function RenderNonSortableList() {
  return (
    <ComposedList sortable={false}>
      <ComposedList.Item>
        <ComposedList.DragHandle>drag</ComposedList.DragHandle>
        Item A
      </ComposedList.Item>
    </ComposedList>
  );
}

// ---------------------------------------------------------------------------
// Shared mock utilities
// ---------------------------------------------------------------------------

const ITEM_RECTS = [
  { top: 0, bottom: 40, left: 0, right: 200, width: 200, height: 40, x: 0, y: 0 },
  { top: 40, bottom: 80, left: 0, right: 200, width: 200, height: 40, x: 0, y: 40 },
  { top: 80, bottom: 120, left: 0, right: 200, width: 200, height: 40, x: 0, y: 80 },
];

/** Variable-height rects: A=30px, B=60px, C=50px */
const VARIABLE_RECTS = [
  { top: 0, bottom: 30, left: 0, right: 200, width: 200, height: 30, x: 0, y: 0 },
  { top: 30, bottom: 90, left: 0, right: 200, width: 200, height: 60, x: 0, y: 30 },
  { top: 90, bottom: 140, left: 0, right: 200, width: 200, height: 50, x: 0, y: 90 },
];

function mockItemRects(items: NodeListOf<Element>, rects?: typeof ITEM_RECTS): void {
  const rectSource = rects ?? ITEM_RECTS;
  for (const [i, item] of [...items].entries()) {
    (item as HTMLElement).getBoundingClientRect = () =>
      ({ ...rectSource[i], toJSON: () => {} }) as DOMRect;
  }
}

// ---------------------------------------------------------------------------
// Cleanup — always remove appended elements
// ---------------------------------------------------------------------------

const appendedElements: Element[] = [];

function appendToBody(el: Element): void {
  document.body.appendChild(el);
  appendedElements.push(el);
}

afterEach(() => {
  for (const el of appendedElements) {
    el.parentNode?.removeChild(el);
  }
  appendedElements.length = 0;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: List.reorder utility', () => {
  it('moves item forward', () => {
    expect(ComposedList.reorder(['A', 'B', 'C'], 0, 2)).toEqual(['B', 'C', 'A']);
  });

  it('moves item backward', () => {
    expect(ComposedList.reorder(['A', 'B', 'C'], 2, 0)).toEqual(['C', 'A', 'B']);
  });

  it('returns a new array without mutating original', () => {
    const original = ['A', 'B', 'C'];
    const result = ComposedList.reorder(original, 0, 2);
    expect(result).not.toBe(original);
    expect(original).toEqual(['A', 'B', 'C']);
  });

  it('handles adjacent swap forward', () => {
    expect(ComposedList.reorder(['A', 'B', 'C'], 0, 1)).toEqual(['B', 'A', 'C']);
  });

  it('handles adjacent swap backward', () => {
    expect(ComposedList.reorder(['A', 'B', 'C'], 1, 0)).toEqual(['B', 'A', 'C']);
  });

  it('handles single-element array (no-op)', () => {
    expect(ComposedList.reorder(['A'], 0, 0)).toEqual(['A']);
  });
});

describe('Feature: List drag-and-sort', () => {
  describe('Given sortable={false}', () => {
    it('Then DragHandle does not get data-sortable attribute', () => {
      const el = RenderNonSortableList();
      const handle = el.querySelector('[data-list-drag-handle]');
      expect(handle).toBeTruthy();
      expect(handle?.getAttribute('data-sortable')).toBeNull();
    });
  });

  describe('Given <List sortable onReorder={fn}> without DragHandle', () => {
    it('Then items have data-sortable-item for drag tracking', () => {
      const el = RenderSortableList({ onReorder: () => {} });
      const items = el.querySelectorAll('li');
      expect(items.length).toBe(3);
      for (const item of items) {
        expect(item.hasAttribute('data-sortable-item')).toBe(true);
      }
    });

    describe('When drag sequence on item directly', () => {
      it('Then onReorder is called with correct indices', () => {
        const calls: Array<{ from: number; to: number }> = [];
        const ul = RenderSortableList({
          onReorder: (from, to) => calls.push({ from, to }),
        });
        appendToBody(ul);

        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        // Drag directly on item (no handle) — clientY=100 is at C's midpoint
        // insertionIndex=2 (before C), fromIndex=0, dest=2-1=1
        items[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 100 }));

        expect(calls.length).toBe(1);
        expect(calls[0]).toEqual({ from: 0, to: 1 });
      });
    });
  });

  describe('Given <List sortable onReorder={fn}> with DragHandle', () => {
    it('Then DragHandle has data-sortable attribute', () => {
      const el = RenderSortableListWithHandles({ onReorder: () => {} });
      const handles = el.querySelectorAll('[data-list-drag-handle]');
      expect(handles.length).toBe(3);
      for (const handle of handles) {
        expect(handle.getAttribute('data-sortable')).toBe('');
      }
    });

    it('Then List.Item has data-sortable-item attribute', () => {
      const el = RenderSortableListWithHandles({ onReorder: () => {} });
      const items = el.querySelectorAll('li');
      expect(items.length).toBe(3);
      for (const item of items) {
        expect(item.hasAttribute('data-sortable-item')).toBe(true);
      }
    });

    it('Then clicking item body (not handle) does NOT start drag', () => {
      const calls: Array<{ from: number; to: number }> = [];
      const ul = RenderSortableListWithHandles({
        onReorder: (from, to) => calls.push({ from, to }),
      });
      appendToBody(ul);

      const items = ul.querySelectorAll('li');
      mockItemRects(items);

      // Click directly on the item text, not the handle
      items[0].dispatchEvent(
        new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
      );
      document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 100 }));

      // Should NOT trigger reorder — handles are present, so only handle drags count
      expect(calls.length).toBe(0);
    });

    describe('When drag sequence (pointerdown → pointermove → pointerup)', () => {
      it('Then onReorder is called with correct indices', () => {
        const calls: Array<{ from: number; to: number }> = [];
        const ul = RenderSortableListWithHandles({
          onReorder: (from, to) => calls.push({ from, to }),
        });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        // Simulate drag: pick up first item via handle, move to C's midpoint
        // insertionIndex=2 (before C), fromIndex=0, dest=2-1=1
        handles[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 100 }));
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 100 }));

        expect(calls.length).toBe(1);
        expect(calls[0]).toEqual({ from: 0, to: 1 });
      });

      it('Then data-dragging attribute is set during drag', () => {
        const ul = RenderSortableListWithHandles({ onReorder: () => {} });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        // Start drag
        handles[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );

        expect(items[0].hasAttribute('data-dragging')).toBe(true);

        // Drop
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 20 }));

        expect(items[0].hasAttribute('data-dragging')).toBe(false);
      });
    });

    describe('When dragging item A just past B midpoint (destination-after-removal)', () => {
      it('Then onReorder is called with (0, 1) — not raw insertion index (0, 2)', () => {
        const calls: Array<{ from: number; to: number }> = [];
        const ul = RenderSortableListWithHandles({
          onReorder: (from, to) => calls.push({ from, to }),
        });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        // Drag from item A (y=20) to just past B's midpoint (y=61)
        handles[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 61 }));
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 61 }));

        expect(calls.length).toBe(1);
        // insertionIndex=2 (before C), fromIndex=0, dest=2-1=1
        expect(calls[0]).toEqual({ from: 0, to: 1 });
      });
    });

    describe('When dragging item A below all items', () => {
      it('Then onReorder is called with (0, 2) — destination after removal', () => {
        const calls: Array<{ from: number; to: number }> = [];
        const ul = RenderSortableListWithHandles({
          onReorder: (from, to) => calls.push({ from, to }),
        });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        // Drag from item A (y=20) to below all items (y=130)
        handles[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 130 }));
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 130 }));

        expect(calls.length).toBe(1);
        // insertionIndex=3 (items.length), fromIndex=0, dest=3-1=2
        expect(calls[0]).toEqual({ from: 0, to: 2 });
      });
    });

    describe('When dragging last item below all items (no-op)', () => {
      it('Then onReorder is NOT called', () => {
        const calls: Array<{ from: number; to: number }> = [];
        const ul = RenderSortableListWithHandles({
          onReorder: (from, to) => calls.push({ from, to }),
        });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        // Drag item C (last) to below all items
        handles[2].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }),
        );
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 130 }));

        // insertionIndex=3, fromIndex=2, dest=3-1=2=fromIndex → no-op
        expect(calls.length).toBe(0);
      });
    });

    describe('When dragging item C before item A (upward)', () => {
      it('Then onReorder is called with (2, 0)', () => {
        const calls: Array<{ from: number; to: number }> = [];
        const ul = RenderSortableListWithHandles({
          onReorder: (from, to) => calls.push({ from, to }),
        });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        // Drag from item C (y=100) to above A's midpoint (y=10)
        handles[2].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }),
        );
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 10 }));
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 10 }));

        expect(calls.length).toBe(1);
        // insertionIndex=0, fromIndex=2, 0 is not > 2 → dest=0
        expect(calls[0]).toEqual({ from: 2, to: 0 });
      });
    });

    describe('When drag ends at same position', () => {
      it('Then onReorder is NOT called', () => {
        const calls: Array<{ from: number; to: number }> = [];
        const ul = RenderSortableListWithHandles({
          onReorder: (from, to) => calls.push({ from, to }),
        });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        handles[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 20 }));

        expect(calls.length).toBe(0);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 2: Animated item shifting during drag
// ---------------------------------------------------------------------------

describe('Feature: Animated drag-sort item shifting', () => {
  describe('Given a sortable animated list [A(h=40), B(h=40), C(h=40)]', () => {
    describe('When dragging A past B midpoint (downward)', () => {
      it('Then B shifts up by dragged item height', () => {
        const ul = RenderAnimatedSortableList({ onReorder: () => {} });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        // Start drag on item A
        handles[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );

        // Move past B's midpoint (y=61, past midY=60)
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 61 }));

        // B should shift up by A's height (40px)
        expect(items[1].style.transform).toBe('translateY(-40px)');
        // C should not shift
        expect(items[2].style.transform).toBe('');

        // Cleanup
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 61 }));
      });
    });

    describe('When dragging A past C midpoint (downward)', () => {
      it('Then both B and C shift up by dragged item height', () => {
        const ul = RenderAnimatedSortableList({ onReorder: () => {} });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        handles[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );

        // Move past C's midpoint (y=101, past midY=100)
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 101 }));

        expect(items[1].style.transform).toBe('translateY(-40px)');
        expect(items[2].style.transform).toBe('translateY(-40px)');

        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 101 }));
      });
    });

    describe('When dragging A past B then back above B midpoint', () => {
      it('Then B transform is cleared', () => {
        const ul = RenderAnimatedSortableList({ onReorder: () => {} });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        handles[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );

        // Move past B
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 61 }));
        expect(items[1].style.transform).toBe('translateY(-40px)');

        // Move back above B's midpoint
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 20 }));
        expect(items[1].style.transform).toBe('');

        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 20 }));
      });
    });

    describe('When dragging C upward past B midpoint', () => {
      it('Then B shifts down by dragged item height', () => {
        const ul = RenderAnimatedSortableList({ onReorder: () => {} });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        // Start drag on item C
        handles[2].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }),
        );

        // Move above B's midpoint (y=59, above midY=60)
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 59 }));

        // A should not shift (above the target range)
        expect(items[0].style.transform).toBe('');
        // B should shift down by C's height (40px)
        expect(items[1].style.transform).toBe('translateY(40px)');

        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 59 }));
      });
    });

    describe('When dropping after shift transforms are applied', () => {
      it('Then all shift transforms are cleared before onReorder fires', () => {
        const calls: Array<{ from: number; to: number }> = [];
        const ul = RenderAnimatedSortableList({
          onReorder: (from, to) => {
            // At the time onReorder fires, transforms should be cleared
            const items = ul.querySelectorAll('li');
            for (const item of items) {
              expect(item.style.transform).toBe('');
            }
            calls.push({ from, to });
          },
        });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        handles[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 61 }));

        // Verify shifts are applied during drag
        expect(items[1].style.transform).toBe('translateY(-40px)');

        // Drop
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 61 }));

        expect(calls.length).toBe(1);
      });
    });
  });

  describe('Given a sortable animated list (dragged item lift)', () => {
    describe('When the user starts dragging item B', () => {
      it('Then B is positioned absolutely at its original coordinates', () => {
        const ul = RenderAnimatedSortableList({ onReorder: () => {} });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        // Mock the ul's bounding rect for offset calculations
        (ul as HTMLElement).getBoundingClientRect = () =>
          ({
            top: 0,
            left: 0,
            bottom: 120,
            right: 200,
            width: 200,
            height: 120,
            x: 0,
            y: 0,
            toJSON: () => {},
          }) as DOMRect;

        handles[1].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 60, bubbles: true }),
        );

        expect(items[1].style.position).toBe('absolute');
        expect(items[1].style.width).toBe('200px');
        expect(items[1].style.zIndex).toBe('50');

        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 60 }));
      });

      it('Then a placeholder with matching height is inserted', () => {
        const ul = RenderAnimatedSortableList({ onReorder: () => {} });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        (ul as HTMLElement).getBoundingClientRect = () =>
          ({
            top: 0,
            left: 0,
            bottom: 120,
            right: 200,
            width: 200,
            height: 120,
            x: 0,
            y: 0,
            toJSON: () => {},
          }) as DOMRect;

        handles[1].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 60, bubbles: true }),
        );

        const placeholder = ul.querySelector('[data-drag-placeholder]');
        expect(placeholder).toBeTruthy();
        expect((placeholder as HTMLElement).style.height).toBe('40px');
        expect((placeholder as HTMLElement).style.visibility).toBe('hidden');
        // Placeholder must NOT be sortable
        expect(placeholder?.hasAttribute('data-sortable-item')).toBe(false);

        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 60 }));
      });
    });

    describe('When the user moves the pointer 50px down', () => {
      it('Then dragged item top increases by 50px', () => {
        const ul = RenderAnimatedSortableList({ onReorder: () => {} });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        (ul as HTMLElement).getBoundingClientRect = () =>
          ({
            top: 0,
            left: 0,
            bottom: 120,
            right: 200,
            width: 200,
            height: 120,
            x: 0,
            y: 0,
            toJSON: () => {},
          }) as DOMRect;

        handles[1].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 60, bubbles: true }),
        );

        // Item B starts at top=40 relative to ul (top=0)
        const initialTop = 40;

        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 110 }));

        expect(items[1].style.top).toBe(`${initialTop + 50}px`);

        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 110 }));
      });
    });

    describe('When the user drops', () => {
      it('Then placeholder is removed and positioning styles are cleared', () => {
        const ul = RenderAnimatedSortableList({ onReorder: () => {} });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        (ul as HTMLElement).getBoundingClientRect = () =>
          ({
            top: 0,
            left: 0,
            bottom: 120,
            right: 200,
            width: 200,
            height: 120,
            x: 0,
            y: 0,
            toJSON: () => {},
          }) as DOMRect;

        handles[1].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 60, bubbles: true }),
        );

        // Verify placeholder exists during drag
        expect(ul.querySelector('[data-drag-placeholder]')).toBeTruthy();

        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 60 }));

        // After drop: placeholder removed, styles cleared
        expect(ul.querySelector('[data-drag-placeholder]')).toBeNull();
        expect(items[1].style.position).toBe('');
        expect(items[1].style.width).toBe('');
        expect(items[1].style.zIndex).toBe('');
        expect(items[1].style.top).toBe('');
        expect(items[1].style.left).toBe('');
      });
    });
  });

  describe('Given prefers-reduced-motion is enabled', () => {
    it('Then shift transforms are applied instantly (transition: none)', () => {
      // Mock matchMedia to return reduced motion
      const originalMatchMedia = globalThis.matchMedia;
      globalThis.matchMedia = ((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      })) as typeof globalThis.matchMedia;

      try {
        const ul = RenderAnimatedSortableList({ onReorder: () => {} });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        (ul as HTMLElement).getBoundingClientRect = () =>
          ({
            top: 0,
            left: 0,
            bottom: 120,
            right: 200,
            width: 200,
            height: 120,
            x: 0,
            y: 0,
            toJSON: () => {},
          }) as DOMRect;

        handles[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );

        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 61 }));

        // Items should shift but with no transition (instant)
        expect(items[1].style.transform).toBe('translateY(-40px)');
        expect(items[1].style.transition).toBe('none');

        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 61 }));
      } finally {
        globalThis.matchMedia = originalMatchMedia;
      }
    });
  });

  describe('Given a sortable list with animate=false', () => {
    describe('When the user drags an item', () => {
      it('Then non-dragged items do not get shift transforms', () => {
        const ul = RenderSortableListWithHandles({ onReorder: () => {} });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        handles[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 61 }));

        // Non-animated list: B should NOT shift
        expect(items[1].style.transform).toBe('');

        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 61 }));
      });

      it('Then a drop indicator is shown during drag', () => {
        const ul = RenderSortableListWithHandles({ onReorder: () => {} });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        handles[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 61 }));

        // Drop indicator should be visible in the DOM
        const indicator = ul.querySelector('[data-drop-indicator]');
        expect(indicator).toBeTruthy();

        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 61 }));

        // After drop, indicator should be removed
        expect(ul.querySelector('[data-drop-indicator]')).toBeNull();
      });
    });
  });

  describe('Given a sortable animated list with variable-height items [A(30), B(60), C(50)]', () => {
    describe('When dragging A past B midpoint (downward)', () => {
      it('Then B shifts up by A height (30px), not B height', () => {
        const ul = RenderAnimatedSortableList({ onReorder: () => {} });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items, VARIABLE_RECTS);

        // Start drag on item A
        handles[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 15, bubbles: true }),
        );

        // Move past B's midpoint (B: top=30, h=60, midY=60 → y=61)
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 61 }));

        // B should shift up by A's height (30px), not its own height
        expect(items[1].style.transform).toBe('translateY(-30px)');
        // C should not shift
        expect(items[2].style.transform).toBe('');

        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 61 }));
      });
    });
  });

  describe('Given a sortable list, dragging first item above all items', () => {
    describe('When drag A to above A (no movement)', () => {
      it('Then onReorder is NOT called (no-op)', () => {
        const calls: Array<{ from: number; to: number }> = [];
        const ul = RenderSortableListWithHandles({
          onReorder: (from, to) => calls.push({ from, to }),
        });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        // Drag item A (y=20) upward above all items (y=-10)
        handles[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: -10 }));

        // insertionIndex=0, fromIndex=0, dest=0=fromIndex → no-op
        expect(calls.length).toBe(0);
      });
    });
  });

  describe('Given a sortable animated list, dragging C upward past both B and A', () => {
    describe('When dragging C above A midpoint', () => {
      it('Then both A and B shift down by C height', () => {
        const ul = RenderAnimatedSortableList({ onReorder: () => {} });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        // Start drag on item C
        handles[2].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }),
        );

        // Move above A's midpoint (y=19, above midY=20)
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 19 }));

        // A should shift down by C's height (40px)
        expect(items[0].style.transform).toBe('translateY(40px)');
        // B should shift down by C's height (40px)
        expect(items[1].style.transform).toBe('translateY(40px)');

        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 19 }));
      });

      it('Then onReorder is called with (2, 0)', () => {
        const calls: Array<{ from: number; to: number }> = [];
        const ul = RenderAnimatedSortableList({
          onReorder: (from, to) => calls.push({ from, to }),
        });
        appendToBody(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        mockItemRects(items);

        handles[2].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }),
        );
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 19 }));
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 19 }));

        expect(calls.length).toBe(1);
        expect(calls[0]).toEqual({ from: 2, to: 0 });
      });
    });
  });
});
