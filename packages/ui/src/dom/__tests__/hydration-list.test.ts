import { afterEach, describe, expect, it } from 'bun:test';
import { endHydration, enterChildren, startHydration } from '../../hydrate/hydration-context';
import { signal } from '../../runtime/signal';
import { __element } from '../element';
import { __list } from '../list';

describe('__list — hydration', () => {
  afterEach(() => {
    endHydration();
  });

  it('claims existing item nodes during hydration', () => {
    // Set up SSR output: a <ul> with three <li> items
    const root = document.createElement('div');
    const ul = document.createElement('ul');
    for (const text of ['A', 'B', 'C']) {
      const li = document.createElement('li');
      li.textContent = text;
      ul.appendChild(li);
    }
    root.appendChild(ul);

    // Start hydration at the ul's children level
    startHydration(root);
    // Claim the ul
    const claimedUl = __element('ul');
    expect(claimedUl).toBe(ul);
    enterChildren(claimedUl);

    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
      { id: 3, text: 'C' },
    ]);

    let renderCount = 0;
    __list(
      claimedUl,
      items,
      (item) => item.id,
      (_item) => {
        renderCount++;
        // During hydration, __element will claim existing <li> nodes
        const li = __element('li');
        return li;
      },
    );

    // renderFn should have been called for each item
    expect(renderCount).toBe(3);
    // Container should still have the same nodes (no DOM mutations)
    expect(claimedUl.children.length).toBe(3);
  });

  it('skips initial reconciliation (no DOM mutations)', () => {
    const root = document.createElement('div');
    const ul = document.createElement('ul');
    const originalLis: HTMLElement[] = [];
    for (const text of ['A', 'B']) {
      const li = document.createElement('li');
      li.textContent = text;
      ul.appendChild(li);
      originalLis.push(li);
    }
    root.appendChild(ul);

    startHydration(root);
    const claimedUl = __element('ul');
    enterChildren(claimedUl);

    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ]);

    __list(
      claimedUl,
      items,
      (item) => item.id,
      (_item) => {
        const li = __element('li');
        return li;
      },
    );

    // Original DOM nodes should be intact (no insertBefore calls during hydration)
    expect(claimedUl.children[0]).toBe(originalLis[0]);
    expect(claimedUl.children[1]).toBe(originalLis[1]);
  });

  it('populates nodeMap from claimed nodes (reorder reuses adopted nodes)', () => {
    const root = document.createElement('div');
    const ul = document.createElement('ul');
    const ssrLis: HTMLElement[] = [];
    for (const text of ['A', 'B', 'C']) {
      const li = document.createElement('li');
      li.textContent = text;
      ul.appendChild(li);
      ssrLis.push(li);
    }
    root.appendChild(ul);

    startHydration(root);
    const claimedUl = __element('ul');
    enterChildren(claimedUl);

    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
      { id: 3, text: 'C' },
    ]);

    __list(
      claimedUl,
      items,
      (item) => item.id,
      (_item) => {
        const li = __element('li');
        return li;
      },
    );

    endHydration();

    // Reorder: [C, A, B] — nodeMap must have the adopted nodes to reuse them
    items.value = [
      { id: 3, text: 'C' },
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ];

    // The same SSR node references should be reused (not recreated)
    expect(claimedUl.children[0]).toBe(ssrLis[2]); // C was ssrLis[2]
    expect(claimedUl.children[1]).toBe(ssrLis[0]); // A was ssrLis[0]
    expect(claimedUl.children[2]).toBe(ssrLis[1]); // B was ssrLis[1]
  });

  it('list update after hydration works normally (add/remove/reorder)', () => {
    const root = document.createElement('div');
    const ul = document.createElement('ul');
    for (const text of ['A', 'B']) {
      const li = document.createElement('li');
      li.textContent = text;
      ul.appendChild(li);
    }
    root.appendChild(ul);

    startHydration(root);
    const claimedUl = __element('ul');
    enterChildren(claimedUl);

    const items = signal([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ]);

    __list(
      claimedUl,
      items,
      (item) => item.id,
      (_item) => {
        const li = __element('li');
        return li;
      },
    );

    endHydration();

    // Add an item
    items.value = [
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
      { id: 3, text: 'C' },
    ];
    expect(claimedUl.children.length).toBe(3);

    // Remove an item
    items.value = [
      { id: 1, text: 'A' },
      { id: 3, text: 'C' },
    ];
    expect(claimedUl.children.length).toBe(2);
  });
});
