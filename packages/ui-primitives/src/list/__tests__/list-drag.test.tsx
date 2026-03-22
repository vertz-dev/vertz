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
// Tests
// ---------------------------------------------------------------------------

describe('Feature: List drag-and-sort', () => {
  describe('Given sortable={false}', () => {
    it('Then DragHandle does not get drag cursor attribute', () => {
      const el = RenderNonSortableList();
      const handle = el.querySelector('[data-list-drag-handle]');
      expect(handle).toBeTruthy();
      // When not sortable, the handle should not have data-sortable
      expect(handle?.getAttribute('data-sortable')).toBeNull();
    });
  });

  describe('Given <List sortable onReorder={fn}> without DragHandle', () => {
    it('Then entire List.Item acts as drag handle', () => {
      const calls: Array<{ from: number; to: number }> = [];
      const el = RenderSortableList({
        onReorder: (from, to) => calls.push({ from, to }),
      });
      const items = el.querySelectorAll('li');
      expect(items.length).toBe(3);
      // Items should have data-sortable attribute indicating they are draggable
      for (const item of items) {
        expect(item.getAttribute('data-sortable')).toBe('');
      }
    });
  });

  describe('Given <List sortable onReorder={fn}> with DragHandle', () => {
    it('Then DragHandle has data-sortable attribute', () => {
      const calls: Array<{ from: number; to: number }> = [];
      const el = RenderSortableListWithHandles({
        onReorder: (from, to) => calls.push({ from, to }),
      });
      const handles = el.querySelectorAll('[data-list-drag-handle]');
      expect(handles.length).toBe(3);
      for (const handle of handles) {
        expect(handle.getAttribute('data-sortable')).toBe('');
      }
    });

    it('Then List.Item has data-sortable-item attribute for index tracking', () => {
      const el = RenderSortableListWithHandles({
        onReorder: () => {},
      });
      const items = el.querySelectorAll('li');
      expect(items.length).toBe(3);
      // Items need data attributes for drag index calculation
      for (const item of items) {
        expect(item.hasAttribute('data-sortable-item')).toBe(true);
      }
    });

    describe('When drag sequence (pointerdown → pointermove → pointerup)', () => {
      it('Then onReorder is called with correct indices', () => {
        const calls: Array<{ from: number; to: number }> = [];
        const ul = RenderSortableListWithHandles({
          onReorder: (from, to) => calls.push({ from, to }),
        });

        // Attach to document for global event handling
        document.body.appendChild(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        expect(handles.length).toBe(3);

        // Mock item rects for index calculation
        const mockRects = [
          { top: 0, bottom: 40, left: 0, right: 200, width: 200, height: 40, x: 0, y: 0 },
          { top: 40, bottom: 80, left: 0, right: 200, width: 200, height: 40, x: 0, y: 40 },
          { top: 80, bottom: 120, left: 0, right: 200, width: 200, height: 40, x: 0, y: 80 },
        ];
        for (const [i, item] of [...items].entries()) {
          (item as HTMLElement).getBoundingClientRect = () =>
            ({ ...mockRects[i], toJSON: () => {} }) as DOMRect;
        }

        // Simulate drag: pick up first item, move to third position
        const firstHandle = handles[0];
        firstHandle.dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );

        // Move to position of third item (y=100, past midpoint of item at y=80)
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 100 }));

        // Drop
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 100 }));

        expect(calls.length).toBe(1);
        expect(calls[0]).toEqual({ from: 0, to: 2 });

        // Cleanup
        document.body.removeChild(ul);
      });

      it('Then data-dragging attribute is set during drag', () => {
        const ul = RenderSortableListWithHandles({
          onReorder: () => {},
        });
        document.body.appendChild(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');

        // Mock rects
        for (const item of items) {
          (item as HTMLElement).getBoundingClientRect = () =>
            ({
              top: 0,
              bottom: 40,
              left: 0,
              right: 200,
              width: 200,
              height: 40,
              x: 0,
              y: 0,
              toJSON: () => {},
            }) as DOMRect;
        }

        // Start drag
        handles[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );

        // The dragged item should have data-dragging attribute
        expect(items[0].hasAttribute('data-dragging')).toBe(true);

        // Drop
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 20 }));

        // After drop, data-dragging should be removed
        expect(items[0].hasAttribute('data-dragging')).toBe(false);

        document.body.removeChild(ul);
      });
    });

    describe('When drag ends at same position', () => {
      it('Then onReorder is NOT called', () => {
        const calls: Array<{ from: number; to: number }> = [];
        const ul = RenderSortableListWithHandles({
          onReorder: (from, to) => calls.push({ from, to }),
        });
        document.body.appendChild(ul);

        const handles = ul.querySelectorAll('[data-list-drag-handle]');
        const items = ul.querySelectorAll('li');
        const mockRects = [
          { top: 0, bottom: 40, left: 0, right: 200, width: 200, height: 40, x: 0, y: 0 },
          { top: 40, bottom: 80, left: 0, right: 200, width: 200, height: 40, x: 0, y: 40 },
          { top: 80, bottom: 120, left: 0, right: 200, width: 200, height: 40, x: 0, y: 80 },
        ];
        for (const [i, item] of [...items].entries()) {
          (item as HTMLElement).getBoundingClientRect = () =>
            ({ ...mockRects[i], toJSON: () => {} }) as DOMRect;
        }

        // Drag first item and drop at same position
        handles[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 20 }));

        // Should NOT call onReorder since from === to (both 0)
        expect(calls.length).toBe(0);

        document.body.removeChild(ul);
      });
    });
  });

  describe('Given <List sortable> without DragHandle', () => {
    describe('When drag sequence on item directly', () => {
      it('Then onReorder is called', () => {
        const calls: Array<{ from: number; to: number }> = [];
        const ul = RenderSortableList({
          onReorder: (from, to) => calls.push({ from, to }),
        });
        document.body.appendChild(ul);

        const items = ul.querySelectorAll('li');
        const mockRects = [
          { top: 0, bottom: 40, left: 0, right: 200, width: 200, height: 40, x: 0, y: 0 },
          { top: 40, bottom: 80, left: 0, right: 200, width: 200, height: 40, x: 0, y: 40 },
          { top: 80, bottom: 120, left: 0, right: 200, width: 200, height: 40, x: 0, y: 80 },
        ];
        for (const [i, item] of [...items].entries()) {
          (item as HTMLElement).getBoundingClientRect = () =>
            ({ ...mockRects[i], toJSON: () => {} }) as DOMRect;
        }

        // Drag directly on item (no handle)
        items[0].dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 20, bubbles: true }),
        );
        document.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 100 }));

        expect(calls.length).toBe(1);
        expect(calls[0]).toEqual({ from: 0, to: 2 });

        document.body.removeChild(ul);
      });
    });
  });
});
