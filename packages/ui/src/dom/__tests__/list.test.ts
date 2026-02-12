import { describe, expect, it } from 'vitest';
import { effect, signal } from '../../runtime/signal';
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
          effect(() => {
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
        effect(() => {
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
        effect(() => {
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
});
