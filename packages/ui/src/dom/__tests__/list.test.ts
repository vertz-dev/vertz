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

  describe('container with pre-existing children', () => {
    it('appends list items after pre-existing children on initial render', () => {
      const items = signal([
        { id: 1, text: 'A' },
        { id: 2, text: 'B' },
      ]);
      const container = document.createElement('div');
      // Simulate a title div already in the container (like the compiler's __append before __list)
      const titleDiv = document.createElement('div');
      titleDiv.textContent = 'Title';
      container.appendChild(titleDiv);

      __list(
        container,
        items,
        (item) => item.id,
        (item) => {
          const el = document.createElement('span');
          el.textContent = item.text;
          return el;
        },
      );

      expect(container.children.length).toBe(3);
      // Title div must remain first
      expect(container.children[0]).toBe(titleDiv);
      expect(container.children[0]?.textContent).toBe('Title');
      // List items follow
      expect(container.children[1]?.textContent).toBe('A');
      expect(container.children[2]?.textContent).toBe('B');
    });

    it('preserves pre-existing children when list items are reordered', () => {
      const items = signal([
        { id: 1, text: 'A' },
        { id: 2, text: 'B' },
        { id: 3, text: 'C' },
      ]);
      const container = document.createElement('div');
      const titleDiv = document.createElement('div');
      titleDiv.textContent = 'Title';
      container.appendChild(titleDiv);

      __list(
        container,
        items,
        (item) => item.id,
        (item) => {
          const el = document.createElement('span');
          el.textContent = item.text;
          return el;
        },
      );

      // Reorder
      items.value = [
        { id: 3, text: 'C' },
        { id: 1, text: 'A' },
        { id: 2, text: 'B' },
      ];

      expect(container.children.length).toBe(4);
      expect(container.children[0]).toBe(titleDiv);
      expect(container.children[1]?.textContent).toBe('C');
      expect(container.children[2]?.textContent).toBe('A');
      expect(container.children[3]?.textContent).toBe('B');
    });

    it('preserves pre-existing children when new items are added', () => {
      const items = signal([
        { id: 1, text: 'A' },
        { id: 2, text: 'B' },
      ]);
      const container = document.createElement('div');
      const titleDiv = document.createElement('div');
      titleDiv.textContent = 'Title';
      container.appendChild(titleDiv);

      __list(
        container,
        items,
        (item) => item.id,
        (item) => {
          const el = document.createElement('span');
          el.textContent = item.text;
          return el;
        },
      );

      // Add a new item
      items.value = [
        { id: 1, text: 'A' },
        { id: 2, text: 'B' },
        { id: 3, text: 'C' },
      ];

      expect(container.children.length).toBe(4);
      expect(container.children[0]).toBe(titleDiv);
      expect(container.children[0]?.textContent).toBe('Title');
      expect(container.children[1]?.textContent).toBe('A');
      expect(container.children[2]?.textContent).toBe('B');
      expect(container.children[3]?.textContent).toBe('C');
    });

    it('preserves pre-existing children when list items are removed', () => {
      const items = signal([
        { id: 1, text: 'A' },
        { id: 2, text: 'B' },
      ]);
      const container = document.createElement('div');
      const titleDiv = document.createElement('div');
      titleDiv.textContent = 'Title';
      container.appendChild(titleDiv);

      __list(
        container,
        items,
        (item) => item.id,
        (item) => {
          const el = document.createElement('span');
          el.textContent = item.text;
          return el;
        },
      );

      items.value = [{ id: 1, text: 'A' }];

      expect(container.children.length).toBe(2);
      expect(container.children[0]).toBe(titleDiv);
      expect(container.children[1]?.textContent).toBe('A');
    });
  });

  describe('item proxy prototype preservation (#1581)', () => {
    it('Date items preserve instanceof Date through the proxy', () => {
      const dates = signal([new Date(2024, 5, 10), new Date(2024, 5, 11)]);
      const container = document.createElement('div');
      const receivedItems: unknown[] = [];

      __list(
        container,
        dates,
        (_item, i) => i,
        (item) => {
          receivedItems.push(item);
          const el = document.createElement('span');
          el.textContent = String(item);
          return el;
        },
      );

      // The item proxy must preserve instanceof so that user code
      // like `val instanceof Date` works correctly.
      expect(receivedItems[0] instanceof Date).toBe(true);
      expect(receivedItems[1] instanceof Date).toBe(true);
    });

    it('Array items preserve Array.isArray through the proxy', () => {
      const rows = signal([
        [1, 2],
        [3, 4],
      ]);
      const container = document.createElement('div');
      const receivedItems: unknown[] = [];

      __list(
        container,
        rows,
        (_item, i) => i,
        (item) => {
          receivedItems.push(item);
          const el = document.createElement('span');
          return el;
        },
      );

      expect(Array.isArray(receivedItems[0])).toBe(true);
      expect(Array.isArray(receivedItems[1])).toBe(true);
    });

    it('instanceof stays correct after key-reuse signal update', () => {
      const dates = signal([new Date(2024, 0, 1), new Date(2024, 0, 2)]);
      const container = document.createElement('div');
      const receivedItems: unknown[] = [];

      __list(
        container,
        dates,
        (_item, i) => i,
        (item) => {
          receivedItems.push(item);
          const el = document.createElement('span');
          return el;
        },
      );

      // Initial: instanceof works
      expect(receivedItems[0] instanceof Date).toBe(true);

      // Update items with the same keys (index-based) — proxy is reused,
      // signal value changes, getPrototypeOf should reflect the new value.
      dates.value = [new Date(2025, 6, 15), new Date(2025, 6, 16)];

      // The proxy from the initial render should still report correct prototype
      expect(receivedItems[0] instanceof Date).toBe(true);
      expect(Object.getPrototypeOf(receivedItems[0])).toBe(Date.prototype);
    });

    it('proxy is read-only — set returns false', () => {
      const items = signal([{ id: 1, name: 'A' }]);
      const container = document.createElement('div');
      let proxyItem: { id: number; name: string } | undefined;

      __list(
        container,
        items,
        (item) => item.id,
        (item) => {
          proxyItem = item;
          const el = document.createElement('span');
          return el;
        },
      );

      // Strict mode would throw, but in non-strict it returns false.
      // Either way, the original item should not be mutated.
      const original = items.peek()[0];
      expect(original).toBeDefined();
      try {
        (proxyItem as { id: number; name: string }).name = 'mutated';
      } catch {
        // Expected in strict mode
      }
      expect(original?.name).toBe('A');
    });
  });

  describe('unkeyed list (null keyFn)', () => {
    it('produces correct content when items are filtered', () => {
      const items = signal([
        { id: 1, text: 'A' },
        { id: 2, text: 'B' },
        { id: 3, text: 'C' },
      ]);
      const container = document.createElement('ul');
      __list(container, items, null, (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      });

      expect(container.children.length).toBe(3);
      expect(container.children[0]?.textContent).toBe('A');

      // Filter to only the last item
      items.value = [{ id: 3, text: 'C' }];

      expect(container.children.length).toBe(1);
      // Must show 'C', not stale 'A'
      expect(container.children[0]?.textContent).toBe('C');
    });

    it('produces correct content when items are reordered', () => {
      const items = signal([
        { id: 1, text: 'A' },
        { id: 2, text: 'B' },
        { id: 3, text: 'C' },
      ]);
      const container = document.createElement('ul');
      __list(container, items, null, (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      });

      items.value = [
        { id: 3, text: 'C' },
        { id: 1, text: 'A' },
        { id: 2, text: 'B' },
      ];

      expect(container.children.length).toBe(3);
      expect(container.children[0]?.textContent).toBe('C');
      expect(container.children[1]?.textContent).toBe('A');
      expect(container.children[2]?.textContent).toBe('B');
    });

    it('works correctly with primitive items (strings)', () => {
      const items = signal(['Alice', 'Bob', 'Charlie']);
      const container = document.createElement('ul');
      __list(container, items, null, (item) => {
        const li = document.createElement('li');
        li.textContent = item;
        return li;
      });

      expect(container.children.length).toBe(3);
      expect(container.children[0]?.textContent).toBe('Alice');

      // Filter to last item
      items.value = ['Charlie'];

      expect(container.children.length).toBe(1);
      expect(container.children[0]?.textContent).toBe('Charlie');
    });

    it('disposes item scopes when items are removed', () => {
      const items = signal([
        { id: 1, text: 'A' },
        { id: 2, text: 'B' },
      ]);
      const cleanedUp: string[] = [];

      const container = document.createElement('ul');
      __list(container, items, null, (item) => {
        onCleanup(() => {
          cleanedUp.push(item.text);
        });
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      });

      expect(cleanedUp).toEqual([]);

      // Replace with a single new item — all old items should be cleaned up
      items.value = [{ id: 3, text: 'C' }];
      expect(cleanedUp).toContain('A');
      expect(cleanedUp).toContain('B');
      expect(container.children.length).toBe(1);
      expect(container.children[0]?.textContent).toBe('C');
    });

    it('recreates all nodes on every update (no stale reuse)', () => {
      const items = signal([
        { id: 1, text: 'A' },
        { id: 2, text: 'B' },
      ]);
      let renderCount = 0;
      const container = document.createElement('ul');
      __list(container, items, null, (item) => {
        renderCount++;
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      });

      expect(renderCount).toBe(2);

      // Update with same-shaped data — full replacement means all re-rendered
      items.value = [
        { id: 1, text: 'A' },
        { id: 2, text: 'B' },
      ];

      expect(renderCount).toBe(4);
    });

    it('emits a console.warn when keyFn is null', () => {
      const originalWarn = console.warn;
      const warnings: string[] = [];
      console.warn = (...args: unknown[]) => {
        warnings.push(String(args[0]));
      };

      try {
        const items = signal([{ id: 1, text: 'A' }]);
        const container = document.createElement('ul');
        __list(container, items, null, (item) => {
          const li = document.createElement('li');
          li.textContent = item.text;
          return li;
        });

        expect(warnings.length).toBe(1);
        expect(warnings[0]).toContain('key');
      } finally {
        console.warn = originalWarn;
      }
    });

    it('preserves pre-existing children', () => {
      const items = signal([
        { id: 1, text: 'A' },
        { id: 2, text: 'B' },
      ]);
      const container = document.createElement('div');
      const titleDiv = document.createElement('div');
      titleDiv.textContent = 'Title';
      container.appendChild(titleDiv);

      __list(container, items, null, (item) => {
        const el = document.createElement('span');
        el.textContent = item.text;
        return el;
      });

      expect(container.children.length).toBe(3);
      expect(container.children[0]).toBe(titleDiv);

      items.value = [{ id: 3, text: 'C' }];

      expect(container.children.length).toBe(2);
      expect(container.children[0]).toBe(titleDiv);
      expect(container.children[1]?.textContent).toBe('C');
    });
  });

  describe('select fix-up', () => {
    it('sets select.value from option[selected] after reconciliation', () => {
      const select = document.createElement('select');
      const items = signal([
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
        { value: 'c', label: 'C' },
      ]);

      __list(
        select,
        items,
        (item) => item.value,
        (item) => {
          const opt = document.createElement('option');
          opt.value = item.value;
          opt.textContent = item.label;
          if (item.value === 'b') {
            opt.setAttribute('selected', '');
          }
          return opt;
        },
      );

      expect(select.value).toBe('b');
    });
  });
});
