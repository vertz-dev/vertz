import { describe, expect, it } from 'bun:test';
import { signal } from '../../runtime/signal';
import { __listValue } from '../list-value';

describe('__listValue', () => {
  /** Helper: mount a __listValue fragment into a container and return the container. */
  function mount<T>(
    items: ReturnType<typeof signal<T[]>>,
    keyFn: ((item: T, index: number) => string | number) | null,
    renderFn: (item: T) => Node,
  ) {
    const fragment = __listValue(items, keyFn, renderFn);
    const container = document.createElement('div');
    container.appendChild(fragment);
    return container;
  }

  it('renders initial items between comment markers', () => {
    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
      { id: 3, text: 'C' },
    ]);

    const container = mount(
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );

    // 2 comment markers + 3 items = 5 child nodes
    expect(container.childNodes.length).toBe(5);
    expect((container.childNodes[1] as HTMLElement).textContent).toBe('A');
    expect((container.childNodes[2] as HTMLElement).textContent).toBe('B');
    expect((container.childNodes[3] as HTMLElement).textContent).toBe('C');
  });

  it('reactively adds new items when signal changes', () => {
    const items = signal([{ id: 1, text: 'A' }]);

    const container = mount(
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );

    expect(container.childNodes.length).toBe(3); // markers + 1 item

    items.value = [
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ];

    expect(container.childNodes.length).toBe(4); // markers + 2 items
    expect((container.childNodes[2] as HTMLElement).textContent).toBe('B');
  });

  it('removes items when signal changes', () => {
    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ]);

    const container = mount(
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );

    expect(container.childNodes.length).toBe(4); // markers + 2

    items.value = [{ id: 1, text: 'A' }];

    expect(container.childNodes.length).toBe(3); // markers + 1
    expect((container.childNodes[1] as HTMLElement).textContent).toBe('A');
  });

  it('reuses DOM nodes by key when items reorder', () => {
    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
      { id: 3, text: 'C' },
    ]);

    const container = mount(
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );

    const nodeA = container.childNodes[1];
    const nodeB = container.childNodes[2];
    const nodeC = container.childNodes[3];

    // Reverse order
    items.value = [
      { id: 3, text: 'C' },
      { id: 2, text: 'B' },
      { id: 1, text: 'A' },
    ];

    // Same DOM nodes, reordered
    expect(container.childNodes[1]).toBe(nodeC);
    expect(container.childNodes[2]).toBe(nodeB);
    expect(container.childNodes[3]).toBe(nodeA);
  });

  it('returns a DisposableNode with dispose method', () => {
    const items = signal([{ id: 1, text: 'A' }]);

    const fragment = __listValue(
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );

    expect(typeof fragment.dispose).toBe('function');
  });

  it('stops reactive updates after dispose', () => {
    const items = signal([{ id: 1, text: 'A' }]);

    const fragment = __listValue(
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );

    const container = document.createElement('div');
    container.appendChild(fragment);

    expect(container.childNodes.length).toBe(3); // markers + 1

    fragment.dispose();

    items.value = [
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ];

    // No change after dispose
    expect(container.childNodes.length).toBe(3);
  });

  it('works with unkeyed mode (null keyFn)', () => {
    const items = signal(['A', 'B']);

    const container = mount(items, null, (item) => {
      const li = document.createElement('li');
      li.textContent = String(item);
      return li;
    });

    expect(container.childNodes.length).toBe(4); // markers + 2

    items.value = ['X', 'Y', 'Z'];

    expect(container.childNodes.length).toBe(5); // markers + 3
    expect((container.childNodes[1] as HTMLElement).textContent).toBe('X');
    expect((container.childNodes[2] as HTMLElement).textContent).toBe('Y');
    expect((container.childNodes[3] as HTMLElement).textContent).toBe('Z');
  });

  it('updates reactive item proxies when item data changes for same key', () => {
    const items = signal([{ id: 1, text: 'Hello' }]);
    let renderCount = 0;

    const container = mount(
      items,
      (item) => item.id,
      (item) => {
        renderCount++;
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );

    expect(renderCount).toBe(1);
    expect((container.childNodes[1] as HTMLElement).textContent).toBe('Hello');

    // Same key, different data — node should be reused (not re-rendered)
    items.value = [{ id: 1, text: 'World' }];

    expect(renderCount).toBe(1); // renderFn NOT called again — same key
  });
});
