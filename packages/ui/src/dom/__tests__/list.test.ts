import { describe, expect, it } from 'bun:test';
import { onCleanup, popScope, pushScope, runCleanups } from '../../runtime/disposal';
import { domEffect, signal } from '../../runtime/signal';
import { __list } from '../list';

describe('__list', () => {
  it('renders initial items', () => {
    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ]);
    const container = document.createElement('ul');
    __list(
      container,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );
    expect(container.children.length).toBe(2);
    expect(container.children[0]?.textContent).toBe('A');
    expect(container.children[1]?.textContent).toBe('B');
  });

  it('reorders DOM nodes without recreating them', () => {
    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
      { id: 3, text: 'C' },
    ]);
    const container = document.createElement('ul');
    __list(
      container,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );
    const originalNodes = [...container.children];
    items.value = [
      { id: 3, text: 'C' },
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ];
    expect(container.children[0]).toBe(originalNodes[2]);
    expect(container.children[1]).toBe(originalNodes[0]);
    expect(container.children[2]).toBe(originalNodes[1]);
  });

  it('removes nodes when items are removed', () => {
    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
      { id: 3, text: 'C' },
    ]);
    const container = document.createElement('ul');
    __list(
      container,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );
    items.value = [{ id: 1, text: 'A' }];
    expect(container.children.length).toBe(1);
    expect(container.children[0]?.textContent).toBe('A');
  });

  it('adds nodes when items are added', () => {
    const items = signal([{ id: 1, text: 'A' }]);
    const container = document.createElement('ul');
    __list(
      container,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );
    items.value = [
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ];
    expect(container.children.length).toBe(2);
    expect(container.children[1]?.textContent).toBe('B');
  });

  it('handles an empty list on creation', () => {
    const items = signal<{ id: number; text: string }[]>([]);
    const container = document.createElement('ul');
    __list(
      container,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );
    expect(container.children.length).toBe(0);

    // Adding items to an empty list should work
    items.value = [{ id: 1, text: 'A' }];
    expect(container.children.length).toBe(1);
    expect(container.children[0]?.textContent).toBe('A');
  });

  it('handles a single-item list', () => {
    const items = signal([{ id: 1, text: 'Only' }]);
    const container = document.createElement('ul');
    __list(
      container,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );
    expect(container.children.length).toBe(1);
    expect(container.children[0]?.textContent).toBe('Only');

    // Removing the single item should leave an empty container
    items.value = [];
    expect(container.children.length).toBe(0);

    // Adding it back should work
    items.value = [{ id: 2, text: 'New' }];
    expect(container.children.length).toBe(1);
    expect(container.children[0]?.textContent).toBe('New');
  });

  it('does not double-render on creation', () => {
    let renderCount = 0;
    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ]);
    const container = document.createElement('ul');
    __list(
      container,
      items,
      (item) => item.id,
      (item) => {
        renderCount++;
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );
    // Each item should be rendered exactly once
    expect(renderCount).toBe(2);
    expect(container.children.length).toBe(2);
  });

  it('returns a dispose function that stops updates', () => {
    const items = signal([{ id: 1, text: 'A' }]);
    const container = document.createElement('ul');
    const dispose = __list(
      container,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );
    expect(container.children.length).toBe(1);

    dispose();
    items.value = [
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ];
    // After dispose, updates should not take effect
    expect(container.children.length).toBe(1);
  });

  it('disposes effects inside a removed list item', () => {
    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ]);
    const counter = signal(0);
    let effectRunCount = 0;

    const container = document.createElement('ul');
    __list(
      container,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        // Each item creates an effect that tracks `counter`
        if (item.id === 2) {
          domEffect(() => {
            counter.value; // subscribe
            effectRunCount++;
          });
        }
        return li;
      },
    );

    // Effect ran once during initial render
    expect(effectRunCount).toBe(1);

    // Remove item 2 from the list
    items.value = [{ id: 1, text: 'A' }];
    expect(container.children.length).toBe(1);

    // Reset counter to verify effect no longer runs
    effectRunCount = 0;
    counter.value = 1;

    // The effect from the removed item should NOT run
    expect(effectRunCount).toBe(0);
  });

  it('disposes old item effects before creating new ones when array is replaced', () => {
    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ]);
    const counter = signal(0);
    const log: string[] = [];

    const container = document.createElement('ul');
    __list(
      container,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        domEffect(() => {
          counter.value; // subscribe
          log.push(`effect-${item.id}`);
        });
        return li;
      },
    );

    // Initial render: effects for items 1 and 2 have run
    expect(log).toEqual(['effect-1', 'effect-2']);
    log.length = 0;

    // Replace with entirely new array — old effects (1, 2) should be disposed
    // before new effects (3, 4) are created
    items.value = [
      { id: 3, text: 'C' },
      { id: 4, text: 'D' },
    ];

    // New effects for items 3 and 4 should have run
    expect(log).toEqual(['effect-3', 'effect-4']);
    log.length = 0;

    // Trigger counter change — only new effects should run
    counter.value = 1;
    expect(log).toEqual(['effect-3', 'effect-4']);

    // Old effects should NOT have run
    expect(log).not.toContain('effect-1');
    expect(log).not.toContain('effect-2');
  });

  it('disposes all item effects when the list itself is disposed', () => {
    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ]);
    const counter = signal(0);
    let effectRunCount = 0;

    const container = document.createElement('ul');
    const dispose = __list(
      container,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        domEffect(() => {
          counter.value; // subscribe
          effectRunCount++;
        });
        return li;
      },
    );

    // Effects ran once each during initial render
    expect(effectRunCount).toBe(2);
    effectRunCount = 0;

    // Dispose the entire list
    dispose();

    // Trigger counter change — no item effects should run
    counter.value = 1;
    expect(effectRunCount).toBe(0);
  });

  it('disposes item effects when a parent scope is cleaned up (nested scope)', () => {
    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ]);
    const counter = signal(0);
    let effectRunCount = 0;

    const container = document.createElement('ul');

    // Simulate __list being nested inside a parent disposal scope
    // (e.g., inside __conditional)
    const parentScope = pushScope();
    __list(
      container,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        domEffect(() => {
          counter.value; // subscribe
          effectRunCount++;
        });
        return li;
      },
    );
    popScope();

    // Effects ran once each during initial render
    expect(effectRunCount).toBe(2);
    effectRunCount = 0;

    // Verify effects are still live before parent disposal
    counter.value = 1;
    expect(effectRunCount).toBe(2);
    effectRunCount = 0;

    // Dispose the parent scope — this should clean up __list AND its item effects
    runCleanups(parentScope);

    // Trigger counter change — no item effects should run
    counter.value = 2;
    expect(effectRunCount).toBe(0);
  });

  it('handles rapid updates without leaking effects (nested scope)', () => {
    const items = signal<{ id: number; text: string }[]>([]);
    const counter = signal(0);
    let effectRunCount = 0;

    const container = document.createElement('ul');

    const parentScope = pushScope();
    __list(
      container,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        domEffect(() => {
          counter.value; // subscribe
          effectRunCount++;
        });
        return li;
      },
    );
    popScope();

    // Rapidly add and remove items
    for (let i = 0; i < 10; i++) {
      items.value = [
        { id: i * 2, text: `X${i * 2}` },
        { id: i * 2 + 1, text: `X${i * 2 + 1}` },
      ];
    }

    // Only the last two items should be active (ids 18 and 19)
    effectRunCount = 0;
    counter.value = 99;
    expect(effectRunCount).toBe(2);

    // Dispose the parent scope
    runCleanups(parentScope);

    effectRunCount = 0;
    counter.value = 100;
    expect(effectRunCount).toBe(0);
  });

  it('onCleanup handlers fire when item is removed from list', () => {
    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ]);
    const cleanedUp: number[] = [];

    const container = document.createElement('ul');
    __list(
      container,
      items,
      (item) => item.id,
      (item) => {
        onCleanup(() => {
          cleanedUp.push(item.id);
        });
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );

    expect(cleanedUp).toEqual([]);

    // Remove item 2
    items.value = [{ id: 1, text: 'A' }];
    expect(cleanedUp).toEqual([2]);
  });

  it('clearing the list (empty array) fires all cleanups', () => {
    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
      { id: 3, text: 'C' },
    ]);
    const cleanedUp: number[] = [];

    const container = document.createElement('ul');
    __list(
      container,
      items,
      (item) => item.id,
      (item) => {
        onCleanup(() => {
          cleanedUp.push(item.id);
        });
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );

    expect(cleanedUp).toEqual([]);

    // Clear all items
    items.value = [];
    expect(container.children.length).toBe(0);
    // All three items should have been cleaned up
    expect(cleanedUp).toContain(1);
    expect(cleanedUp).toContain(2);
    expect(cleanedUp).toContain(3);
    expect(cleanedUp.length).toBe(3);
  });

  it('reordering items does NOT trigger cleanup', () => {
    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
      { id: 3, text: 'C' },
    ]);
    const cleanedUp: number[] = [];

    const container = document.createElement('ul');
    __list(
      container,
      items,
      (item) => item.id,
      (item) => {
        onCleanup(() => {
          cleanedUp.push(item.id);
        });
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );

    expect(cleanedUp).toEqual([]);

    // Reorder items — same keys, different order
    items.value = [
      { id: 3, text: 'C' },
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ];

    // No cleanups should have fired — items were reordered, not removed
    expect(cleanedUp).toEqual([]);
    expect(container.children.length).toBe(3);
  });

  describe('keyFn index parameter', () => {
    it('receives the index as the second argument and is correct (0, 1, 2, etc.)', () => {
      const items = signal([
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
        { id: 'c', text: 'C' },
      ]);
      const receivedIndices: number[] = [];

      const container = document.createElement('ul');
      __list(
        container,
        items,
        (item, index) => {
          receivedIndices.push(index);
          return item.id;
        },
        (item) => {
          const li = document.createElement('li');
          li.textContent = item.text;
          return li;
        },
      );

      // Verify index is correct (0, 1, 2)
      // Note: keyFn is called twice per item (in map and in loop)
      expect(receivedIndices).toContain(0);
      expect(receivedIndices).toContain(1);
      expect(receivedIndices).toContain(2);
      expect(receivedIndices.every((i) => typeof i === 'number')).toBe(true);
    });

    it('list rendering still works correctly when keyFn uses the index', () => {
      const items = signal([
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
      ]);

      const container = document.createElement('ul');
      __list(
        container,
        items,
        (item, index) => String(index), // Use index as key
        (item) => {
          const li = document.createElement('li');
          li.textContent = item.text;
          return li;
        },
      );

      expect(container.children.length).toBe(2);
      expect(container.children[0]?.textContent).toBe('A');
      expect(container.children[1]?.textContent).toBe('B');

      items.value = [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
        { id: 'c', text: 'C' },
      ];

      expect(container.children.length).toBe(3);
      expect(container.children[2]?.textContent).toBe('C');
    });

    it('edge case: keyFn that returns index-based keys works properly (reuses node by position)', () => {
      const items = signal([
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
        { id: 'c', text: 'C' },
      ]);

      const container = document.createElement('ul');
      __list(
        container,
        items,
        (item, index) => String(index),
        (item) => {
          const li = document.createElement('li');
          li.textContent = item.text;
          return li;
        },
      );

      const originalNodes = Array.from(container.children);
      expect(originalNodes.length).toBe(3);

      // Swap the first and last item
      items.value = [
        { id: 'c', text: 'C' },
        { id: 'b', text: 'B' },
        { id: 'a', text: 'A' },
      ];

      // Since the key is index, the framework thinks the items at indices 0, 1, 2 haven't changed identity.
      // Therefore, the original DOM nodes are fully reused without being recreated or moved!
      const currentNodes = Array.from(container.children);
      expect(currentNodes.length).toBe(3);
      expect(currentNodes[0]).toBe(originalNodes[0]);
      expect(currentNodes[1]).toBe(originalNodes[1]);
      expect(currentNodes[2]).toBe(originalNodes[2]);

      // The text contents are unchanged because `__list` does not patch nodes, it just reuses them based on the key
      expect(currentNodes[0]?.textContent).toBe('A');
      expect(currentNodes[2]?.textContent).toBe('C');
    });
  });
});
