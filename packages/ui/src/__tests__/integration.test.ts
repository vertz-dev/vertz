import { describe, expect, test } from 'bun:test';
import { __text } from '../dom/element';
import { __list } from '../dom/list';
import { batch } from '../runtime/scheduler';
import { computed, domEffect, signal } from '../runtime/signal';

describe('Integration Tests — Reactivity Runtime', () => {
  // IT-1A-1: Signal reactivity propagates to DOM text nodes
  test('signal change updates DOM text node', () => {
    const count = signal(0);
    const el = document.createElement('div');
    const textNode = __text(() => `Count: ${count.value}`);
    el.appendChild(textNode);
    expect(el.textContent).toBe('Count: 0');
    count.value = 5;
    expect(el.textContent).toBe('Count: 5');
  });

  // IT-1A-2: Computed values chain transitively and update DOM
  test('computed chain updates DOM when root signal changes', () => {
    const price = signal(10);
    const quantity = signal(2);
    const total = computed(() => price.value * quantity.value);
    const formatted = computed(() => `$${total.value.toFixed(2)}`);
    const el = document.createElement('span');
    const textNode = __text(() => formatted.value);
    el.appendChild(textNode);
    expect(el.textContent).toBe('$20.00');
    quantity.value = 3;
    expect(el.textContent).toBe('$30.00');
  });

  // IT-1A-3: Diamond dependency deduplication
  test('diamond dependency deduplicates updates', () => {
    const a = signal(1);
    const b = computed(() => a.value * 2);
    const c = computed(() => a.value * 3);
    const d = computed(() => b.value + c.value);
    let callCount = 0;
    domEffect(() => {
      d.value;
      callCount++;
    });
    callCount = 0;
    a.value = 2;
    expect(d.value).toBe(10);
    expect(callCount).toBe(1);
  });

  // IT-1A-4: Keyed list reconciliation preserves DOM nodes
  test('__list reorders DOM nodes without recreating them', () => {
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
  });

  // IT-1A-5: batch groups updates
  test('batch groups updates into one flush', () => {
    const a = signal(1);
    const b = signal(2);
    let flushCount = 0;
    domEffect(() => {
      a.value + b.value;
      flushCount++;
    });
    flushCount = 0;
    batch(() => {
      a.value = 10;
      b.value = 20;
    });
    expect(flushCount).toBe(1);
  });

  // IT-1A-6: Disposal cleans up subscriptions
  test('disposal cleans up all subscriptions', () => {
    const count = signal(0);
    let effectRuns = 0;
    const dispose = domEffect(() => {
      count.value;
      effectRuns++;
    });
    effectRuns = 0;
    count.value = 1;
    expect(effectRuns).toBe(1);
    dispose();
    count.value = 2;
    expect(effectRuns).toBe(1);
  });

  // IT-1A-7: signal.notify() triggers subscribers
  test('signal.notify() triggers reactive updates after mutation', () => {
    const items = signal([1, 2, 3]);
    const el = document.createElement('span');
    const textNode = __text(() => items.value.length.toString());
    el.appendChild(textNode);
    expect(el.textContent).toBe('3');
    items.peek().push(4);
    items.notify();
    expect(el.textContent).toBe('4');
  });
});
