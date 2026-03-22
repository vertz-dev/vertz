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

        // Drag directly on item (no handle)
        items[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 100 }));

        expect(calls.length).toBe(1);
        expect(calls[0]).toEqual({ from: 0, to: 2 });
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

        // Simulate drag: pick up first item via handle, move to third position
        handles[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 100 }));
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 100 }));

        expect(calls.length).toBe(1);
        expect(calls[0]).toEqual({ from: 0, to: 2 });
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
