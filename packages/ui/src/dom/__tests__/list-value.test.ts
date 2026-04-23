import { afterEach, describe, expect, it, spyOn } from '@vertz/test';
import { createContext, useContext } from '../../component/context';
import { signal } from '../../runtime/signal';
import { __append, __child, __element } from '../element';
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

  describe('context scope preservation', () => {
    it('renderFn can access context when children thunk resolves inside Provider', () => {
      // Simulates the real compiled output: the parent component wraps
      // children in a thunk `() => __listValue(...)`, and the List component
      // resolves this thunk inside its Provider via __insert/resolveAndInsert.
      const TestContext = createContext<{ label: string }>();
      const items = signal<{ id: number }[]>([]);

      const contextValues: (string | undefined)[] = [];

      // 1. Children thunk (what the compiler generates for parent component)
      const childrenThunk = () =>
        __listValue(
          items,
          (item) => item.id,
          (_item) => {
            const ctx = useContext(TestContext);
            contextValues.push(ctx?.label);
            const li = document.createElement('li');
            li.textContent = ctx?.label ?? 'no-context';
            return li;
          },
        );

      // 2. Resolve the thunk INSIDE the Provider (simulates __insert in ComposedListRoot)
      const container = document.createElement('div');
      TestContext.Provider({ label: 'from-provider' }, () => {
        const fragment = childrenThunk();
        container.appendChild(fragment);
      });

      // 3. Trigger reactive update — items arrive after initial empty render
      items.value = [{ id: 1 }, { id: 2 }];

      // renderFn should find the context on reactive re-runs via scope
      expect(contextValues.length).toBe(2);
      expect(contextValues[0]).toBe('from-provider');
      expect(contextValues[1]).toBe('from-provider');
    });

    it('renderFn preserves context across multiple reactive updates', () => {
      const TestContext = createContext<{ label: string }>();
      const items = signal<{ id: number }[]>([{ id: 1 }]);

      const contextValues: (string | undefined)[] = [];

      const childrenThunk = () =>
        __listValue(
          items,
          (item) => item.id,
          (_item) => {
            const ctx = useContext(TestContext);
            contextValues.push(ctx?.label);
            const li = document.createElement('li');
            li.textContent = ctx?.label ?? 'no-context';
            return li;
          },
        );

      const container = document.createElement('div');
      TestContext.Provider({ label: 'from-provider' }, () => {
        const fragment = childrenThunk();
        container.appendChild(fragment);
      });

      // First render: 1 item rendered with context
      expect(contextValues.length).toBe(1);
      expect(contextValues[0]).toBe('from-provider');

      // Second update: add new items — context must still be available
      items.value = [{ id: 1 }, { id: 2 }, { id: 3 }];
      expect(contextValues.length).toBe(3);
      expect(contextValues[1]).toBe('from-provider');
      expect(contextValues[2]).toBe('from-provider');

      // Third update: remove and add — context still works
      items.value = [{ id: 4 }];
      expect(contextValues.length).toBe(4);
      expect(contextValues[3]).toBe('from-provider');
    });

    it('uses inner Provider value when same context is nested', () => {
      const TestContext = createContext<{ label: string }>();
      const items = signal<{ id: number }[]>([]);

      const contextValues: (string | undefined)[] = [];

      const childrenThunk = () =>
        __listValue(
          items,
          (item) => item.id,
          (_item) => {
            const ctx = useContext(TestContext);
            contextValues.push(ctx?.label);
            const li = document.createElement('li');
            li.textContent = ctx?.label ?? 'no-context';
            return li;
          },
        );

      // Nested Providers: outer provides 'outer', inner provides 'inner'
      const container = document.createElement('div');
      TestContext.Provider({ label: 'outer' }, () => {
        TestContext.Provider({ label: 'inner' }, () => {
          const fragment = childrenThunk();
          container.appendChild(fragment);
        });
      });

      items.value = [{ id: 1 }];

      // Should see the inner Provider's value, not the outer
      expect(contextValues.length).toBe(1);
      expect(contextValues[0]).toBe('inner');
    });

    it('renderFn finds context when rendered via JSX Provider children thunk and items change later', () => {
      // Simulates the real compiler output for:
      //   <ListContext.Provider value={ctx}>{todos.map(...)}</ListContext.Provider>
      // where <ListContext.Provider> uses the JSX single-arg pattern:
      //   ListContext.Provider({ value: ctx, children: () => __listValue(...) })
      // Regression test for #2956.
      const TestContext = createContext<{ label: string }>();
      const items = signal<{ id: number }[]>([{ id: 1 }]);

      const contextValues: (string | undefined)[] = [];

      const container = document.createElement('div');
      // JSX pattern Provider({ value, children: thunk }) returns the rendered node.
      const rendered = TestContext.Provider({
        value: { label: 'from-provider' },
        children: () =>
          __listValue(
            items,
            (item) => item.id,
            (_item) => {
              const ctx = useContext(TestContext);
              contextValues.push(ctx?.label);
              const li = document.createElement('li');
              li.textContent = ctx?.label ?? 'no-context';
              return li;
            },
          ),
      });
      container.appendChild(rendered);

      // First render should have captured the Provider's value
      expect(contextValues.length).toBe(1);
      expect(contextValues[0]).toBe('from-provider');

      // Reactive re-run (Provider is no longer on the call stack)
      items.value = [{ id: 1 }, { id: 2 }];
      expect(contextValues.length).toBe(2);
      expect(contextValues[1]).toBe('from-provider');

      // Another re-run
      items.value = [{ id: 1 }, { id: 2 }, { id: 3 }];
      expect(contextValues.length).toBe(3);
      expect(contextValues[2]).toBe('from-provider');
    });

    it('renderFn finds nested-Provider context through a __child wrapper on re-runs (#2956)', () => {
      // Exact compiled-pattern mirror of ComposedListRoot:
      //   <OuterCtx.Provider value={...}>
      //     <InnerCtx.Provider value={...}>
      //       <ul>{children}</ul>  // children is a thunk passed as prop
      //     </InnerCtx.Provider>
      //   </OuterCtx.Provider>
      // where `children` is `() => __listValue(...)`.
      //
      // The compiler wraps `{children}` in `__child(() => props.children)` —
      // that outer domEffect creates the inner __listValue effect. Both must
      // carry the Provider scope for re-runs after Providers have returned.
      const OuterCtx = createContext<{ id: string }>();
      const InnerCtx = createContext<{ animate: boolean }>();
      const items = signal<{ id: number }[]>([{ id: 1 }, { id: 2 }]);

      const seenOuter: (string | undefined)[] = [];
      const seenInner: (boolean | undefined)[] = [];

      // Caller's children thunk — what the compiler generates for
      // {items.value.map(...)} inside a component.
      const userChildrenThunk = () =>
        __listValue(
          items,
          (item) => item.id,
          (_item) => {
            seenOuter.push(useContext(OuterCtx)?.id);
            seenInner.push(useContext(InnerCtx)?.animate);
            return document.createElement('li');
          },
        );

      const container = document.createElement('div');
      const rendered = OuterCtx.Provider({
        value: { id: 'outer-value' },
        children: () =>
          InnerCtx.Provider({
            value: { animate: true },
            children: () => {
              // Compiler emits: const ul = __element('ul');
              //                 __append(ul, __child(() => __props.children));
              const ul = __element('ul') as HTMLElement;
              __append(
                ul,
                __child(() => userChildrenThunk),
              );
              return ul;
            },
          }),
      });
      container.appendChild(rendered);

      // First render — initial items rendered with both Providers active
      expect(seenOuter).toEqual(['outer-value', 'outer-value']);
      expect(seenInner).toEqual([true, true]);

      // Re-run: Providers are no longer on the call stack; the inner
      // __listValue effect must carry both contexts into the renderFn.
      items.value = [{ id: 1 }, { id: 2 }, { id: 3 }];
      expect(seenOuter[2]).toBe('outer-value');
      expect(seenInner[2]).toBe(true);

      // Another re-run: new-only key forces a fresh renderFn call
      items.value = [{ id: 4 }];
      expect(seenOuter[3]).toBe('outer-value');
      expect(seenInner[3]).toBe(true);
    });

    it('renderFn finds context through a child HTML element when rendered via JSX Provider', () => {
      // Simulates the real compiler output for:
      //   <Ctx.Provider value={ctx}><ul>{children}</ul></Ctx.Provider>
      // where children is a thunk: () => __listValue(...)
      // This is ComposedListRoot's exact pattern.
      const TestContext = createContext<{ label: string }>();
      const items = signal<{ id: number }[]>([{ id: 1 }]);
      const contextValues: (string | undefined)[] = [];

      const childrenThunk = () =>
        __listValue(
          items,
          (item) => item.id,
          (_item) => {
            const ctx = useContext(TestContext);
            contextValues.push(ctx?.label);
            const li = document.createElement('li');
            li.textContent = ctx?.label ?? 'no-context';
            return li;
          },
        );

      const container = document.createElement('div');
      const rendered = TestContext.Provider({
        value: { label: 'from-provider' },
        children: () => {
          // Compiler emits: const ul = __element('ul'); __insert(ul, children); return ul;
          const ul = document.createElement('ul');
          const fragment = childrenThunk();
          ul.appendChild(fragment);
          return ul;
        },
      });
      container.appendChild(rendered);

      expect(contextValues.length).toBe(1);
      expect(contextValues[0]).toBe('from-provider');

      // Reactive re-run after the Provider has returned — captured scope must persist
      items.value = [{ id: 1 }, { id: 2 }];
      expect(contextValues.length).toBe(2);
      expect(contextValues[1]).toBe('from-provider');
    });
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
