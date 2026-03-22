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

function mockItemRects(items: NodeListOf<Element>): void {
  for (const [i, item] of [...items].entries()) {
    (item as HTMLElement).getBoundingClientRect = () =>
      ({ ...ITEM_RECTS[i], toJSON: () => {} }) as DOMRect;
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
