import { describe, expect, it } from 'vitest';
import { signal } from '../../runtime/signal';
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
});
