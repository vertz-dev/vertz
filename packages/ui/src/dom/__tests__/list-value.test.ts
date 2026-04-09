import { afterEach, describe, expect, it, spyOn } from '@vertz/test';
import { signal } from '../../runtime/signal';
import { __listValue, _resetUnkeyedListValueWarning } from '../list-value';

describe('__listValue', () => {
  afterEach(() => {
    _resetUnkeyedListValueWarning();
  });

  /** Helper: mount a __listValue fragment into a container and return the container. */
  function mount<T>(
    items: ReturnType<typeof signal<T[]>> | (() => T[]),
    keyFn: ((item: T, index: number) => string | number) | null,
    renderFn: (item: T, index: number) => Node,
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

  it('accepts a getter function instead of a signal', () => {
    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ]);

    // Pass a getter function, not the signal directly
    const container = mount(
      () => items.value,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );

    expect(container.childNodes.length).toBe(4); // markers + 2
    expect((container.childNodes[1] as HTMLElement).textContent).toBe('A');

    items.value = [
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
      { id: 3, text: 'C' },
    ];

    expect(container.childNodes.length).toBe(5); // markers + 3
    expect((container.childNodes[3] as HTMLElement).textContent).toBe('C');
  });

  it('handles primitive items in keyed mode (no proxy)', () => {
    const items = signal(['alpha', 'beta']);

    const container = mount(
      items,
      (item) => item,
      (item) => {
        const li = document.createElement('li');
        li.textContent = String(item);
        return li;
      },
    );

    expect(container.childNodes.length).toBe(4); // markers + 2
    expect((container.childNodes[1] as HTMLElement).textContent).toBe('alpha');
    expect((container.childNodes[2] as HTMLElement).textContent).toBe('beta');
  });

  it('proxy get trap binds function values to current item', () => {
    const items = signal([
      {
        id: 1,
        label: 'test',
        getLabel() {
          return this.label;
        },
      },
    ]);

    let capturedLabel = '';
    mount(
      items,
      (item) => item.id,
      (item) => {
        capturedLabel = item.getLabel();
        const li = document.createElement('li');
        li.textContent = capturedLabel;
        return li;
      },
    );

    expect(capturedLabel).toBe('test');
  });

  it('proxy set trap returns false (immutable proxy)', () => {
    const items = signal([{ id: 1, text: 'A' }]);

    let proxyRef: { id: number; text: string } | null = null;
    mount(
      items,
      (item) => item.id,
      (item) => {
        proxyRef = item;
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );

    expect(proxyRef).not.toBeNull();
    expect(() => {
      (proxyRef as { id: number; text: string }).text = 'B';
    }).toThrow();
  });

  it('proxy has trap checks current signal value', () => {
    const items = signal([{ id: 1, text: 'hello' }]);

    let hasText = false;
    let hasNonexistent = true;
    mount(
      items,
      (item) => item.id,
      (item) => {
        hasText = 'text' in item;
        hasNonexistent = 'nonexistent' in item;
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );

    expect(hasText).toBe(true);
    expect(hasNonexistent).toBe(false);
  });

  it('proxy ownKeys returns keys of current signal value', () => {
    const items = signal([{ id: 1, text: 'hello' }]);

    let keys: (string | symbol)[] = [];
    mount(
      items,
      (item) => item.id,
      (item) => {
        keys = Object.keys(item);
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );

    expect(keys).toContain('id');
    expect(keys).toContain('text');
  });

  it('proxy getOwnPropertyDescriptor returns descriptor from current value', () => {
    const items = signal([{ id: 1, text: 'hello' }]);

    let descriptor: PropertyDescriptor | undefined;
    mount(
      items,
      (item) => item.id,
      (item) => {
        descriptor = Object.getOwnPropertyDescriptor(item, 'text');
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );

    expect(descriptor).toBeDefined();
    expect(descriptor?.value).toBe('hello');
  });

  it('proxy getPrototypeOf returns prototype of current value', () => {
    class Task {
      id: number;
      text: string;
      constructor(id: number, text: string) {
        this.id = id;
        this.text = text;
      }
    }
    const items = signal([new Task(1, 'hello')]);

    let proto: object | null = null;
    mount(
      items,
      (item) => item.id,
      (item) => {
        proto = Object.getPrototypeOf(item);
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );

    expect(proto).toBe(Task.prototype);
  });

  it('warns once for unkeyed lists and resets with _resetUnkeyedListValueWarning', () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

    const items1 = signal(['a']);
    mount(items1, null, (item) => {
      const li = document.createElement('li');
      li.textContent = String(item);
      return li;
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Second unkeyed list should NOT warn again (deduplicated)
    const items2 = signal(['b']);
    mount(items2, null, (item) => {
      const li = document.createElement('li');
      li.textContent = String(item);
      return li;
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);

    // After reset, warning fires again
    _resetUnkeyedListValueWarning();
    const items3 = signal(['c']);
    mount(items3, null, (item) => {
      const li = document.createElement('li');
      li.textContent = String(item);
      return li;
    });

    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it('handles empty initial array', () => {
    const items = signal<{ id: number; text: string }[]>([]);

    const container = mount(
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
    );

    // Only 2 comment markers
    expect(container.childNodes.length).toBe(2);

    // Adding items works
    items.value = [{ id: 1, text: 'A' }];
    expect(container.childNodes.length).toBe(3);
  });

  describe('index parameter', () => {
    it('passes index as second argument to renderFn (keyed)', () => {
      const items = signal([
        { id: 1, text: 'A' },
        { id: 2, text: 'B' },
        { id: 3, text: 'C' },
      ]);
      const container = mount(
        items,
        (item) => item.id,
        (item, index) => {
          const li = document.createElement('li');
          li.textContent = `${index}: ${item.text}`;
          return li;
        },
      );
      const lis = container.querySelectorAll('li');
      expect(lis[0]?.textContent).toBe('0: A');
      expect(lis[1]?.textContent).toBe('1: B');
      expect(lis[2]?.textContent).toBe('2: C');
    });

    it('passes index as second argument to renderFn (unkeyed)', () => {
      const items = signal(['A', 'B', 'C']);
      const container = mount(items, null, (item, index) => {
        const li = document.createElement('li');
        li.textContent = `${index}: ${item}`;
        return li;
      });
      const lis = container.querySelectorAll('li');
      expect(lis[0]?.textContent).toBe('0: A');
      expect(lis[1]?.textContent).toBe('1: B');
      expect(lis[2]?.textContent).toBe('2: C');
    });
  });
});
