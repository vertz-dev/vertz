import { afterEach, describe, expect, it } from '@vertz/test';
import { signal } from '../../runtime/signal';
import type { ListAnimationHooks } from '../list-animation-context';
import { ListAnimationContext } from '../list-animation-context';
import { __listValue, _resetUnkeyedListValueWarning } from '../list-value';

describe('__listValue with animation hooks', () => {
  afterEach(() => {
    _resetUnkeyedListValueWarning();
  });

  function mountWithAnimation<T>(
    items: ReturnType<typeof signal<T[]>>,
    keyFn: ((item: T, index: number) => string | number) | null,
    renderFn: (item: T) => Node,
    hooks: ListAnimationHooks,
  ) {
    let fragment: ReturnType<typeof __listValue> | undefined;
    ListAnimationContext.Provider(hooks, () => {
      fragment = __listValue(items, keyFn, renderFn);
    });
    const container = document.createElement('div');
    container.appendChild(fragment!);
    return container;
  }

  it('calls onBeforeReconcile and onAfterReconcile on updates', () => {
    const items = signal([{ id: 1, text: 'A' }]);
    const calls: string[] = [];

    const hooks: ListAnimationHooks = {
      onBeforeReconcile: () => calls.push('before'),
      onAfterReconcile: () => calls.push('after'),
      onItemEnter: () => {},
      onItemExit: (_n, _k, done) => done(),
    };

    mountWithAnimation(
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
      hooks,
    );

    // First render should NOT call hooks (no animation on initial render)
    expect(calls).toEqual([]);

    // Update triggers hooks
    items.value = [
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ];

    expect(calls).toEqual(['before', 'after']);
  });

  it('does not set data-presence on first-render items', () => {
    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ]);

    const hooks: ListAnimationHooks = {
      onBeforeReconcile: () => {},
      onAfterReconcile: () => {},
      onItemEnter: (node) => {
        if (node instanceof Element) node.setAttribute('data-presence', 'enter');
      },
      onItemExit: (_n, _k, done) => done(),
    };

    const container = mountWithAnimation(
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
      hooks,
    );

    // First render items should NOT have data-presence
    const firstItems = container.querySelectorAll('li');
    for (const li of firstItems) {
      expect(li.getAttribute('data-presence')).toBeNull();
    }
  });

  it('calls onItemEnter for new items added after first render', () => {
    const items = signal([{ id: 1, text: 'A' }]);
    const enterKeys: (string | number)[] = [];

    const hooks: ListAnimationHooks = {
      onBeforeReconcile: () => {},
      onAfterReconcile: () => {},
      onItemEnter: (_node, key) => enterKeys.push(key),
      onItemExit: (_n, _k, done) => done(),
    };

    mountWithAnimation(
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
      hooks,
    );

    expect(enterKeys).toEqual([]); // No enter on first render

    items.value = [
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ];

    expect(enterKeys).toEqual([2]);
  });

  it('calls onItemExit for removed items and defers DOM removal', () => {
    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ]);
    const exitKeys: (string | number)[] = [];
    const doneFns: Array<() => void> = [];

    const hooks: ListAnimationHooks = {
      onBeforeReconcile: () => {},
      onAfterReconcile: () => {},
      onItemEnter: () => {},
      onItemExit: (_node, key, done) => {
        exitKeys.push(key);
        doneFns.push(done);
      },
    };

    const container = mountWithAnimation(
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item.text;
        return li;
      },
      hooks,
    );

    expect(container.querySelectorAll('li').length).toBe(2);

    // Remove item 2
    items.value = [{ id: 1, text: 'A' }];

    expect(exitKeys).toEqual([2]);
    // Node still in DOM until done() is called
    expect(container.querySelectorAll('li').length).toBe(2);

    // Call done — now node is removed
    doneFns[0]();
    expect(container.querySelectorAll('li').length).toBe(1);
  });

  it('does not call hooks without animation context', () => {
    const items = signal([{ id: 1, text: 'A' }]);

    // Mount without animation context — plain __listValue
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

    // Should work fine without hooks — immediate removal
    items.value = [];
    expect(container.querySelectorAll('li').length).toBe(0);
  });
});
