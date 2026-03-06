import { describe, expect, it } from 'bun:test';
import { signal } from '../../runtime/signal';
import { ListTransition } from '../list-transition';

describe('ListTransition', () => {
  it('renders items in parent container', () => {
    const container = document.createElement('ul');
    const items = signal([
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
    ]);

    const fragment = ListTransition({
      get each() {
        return items.value;
      },
      keyFn: (item) => item.id,
      children: (item) => {
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    });

    container.appendChild(fragment);

    // 2 comment markers + 2 items = 4 nodes
    expect(container.childNodes.length).toBe(4);
    expect((container.childNodes[1] as HTMLElement).textContent).toBe('A');
    expect((container.childNodes[2] as HTMLElement).textContent).toBe('B');
  });

  it('reactive updates flow through component', () => {
    const container = document.createElement('ul');
    const items = signal([{ id: 1, title: 'A' }]);

    const fragment = ListTransition({
      get each() {
        return items.value;
      },
      keyFn: (item) => item.id,
      children: (item) => {
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    });

    container.appendChild(fragment);
    expect(container.childNodes.length).toBe(3); // 2 markers + 1 item

    items.value = [
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
      { id: 3, title: 'C' },
    ];

    // 2 markers + 3 items
    expect(container.childNodes.length).toBe(5);
    expect((container.childNodes[3] as HTMLElement).textContent).toBe('C');
  });

  it('component disposal cleans up all items', () => {
    const container = document.createElement('ul');
    const items = signal([
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
    ]);

    const { onCleanup } = require('../../runtime/disposal');
    const cleanups: number[] = [];

    const fragment = ListTransition({
      get each() {
        return items.value;
      },
      keyFn: (item) => item.id,
      children: (item) => {
        onCleanup(() => {
          cleanups.push(item.id);
        });
        const li = document.createElement('li');
        li.textContent = item.title;
        return li;
      },
    });

    container.appendChild(fragment);

    // Dispose via the attached method
    (fragment as unknown as { dispose: () => void }).dispose();

    expect(cleanups).toEqual([1, 2]);
  });
});
