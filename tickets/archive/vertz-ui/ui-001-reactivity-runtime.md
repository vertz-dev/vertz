# ui-001: Reactivity Runtime

- **Status:** 🔴 Todo
- **Assigned:** nora
- **Phase:** Phase 1A — Reactivity Runtime
- **Estimate:** 40 hours
- **Blocked by:** none
- **Blocks:** ui-002, ui-003, ui-004, ui-005, ui-006, ui-007, ui-008, ui-009, ui-010, ui-011, ui-012, ui-013, ui-014, ui-015
- **PR:** —

## Description

Implement the core reactive runtime for `@vertz/ui` and the DOM binding helpers. This is the foundation that all other phases depend on. Components execute once; signal subscriptions update specific DOM nodes. No virtual DOM, no re-execution.

### What to implement

- `signal<T>(initial)` — reactive container with `.value` getter/setter, `.peek()`, `.notify()`
- `computed<T>(fn)` — derived reactive value, lazy evaluation, diamond dependency deduplication
- `effect(fn)` — side effect that re-runs on dependency changes
- `batch(fn)` — group multiple signal writes, single flush
- `untrack(fn)` — read signals without subscribing
- DOM binding helpers: `__text()`, `__element()`, `__attr()`, `__show()`, `__classList()`
- `__on()` — event binding
- `__conditional()` — ternary/if JSX compilation target
- `__list(signal, keyFn, renderFn)` — keyed list reconciliation (no virtual DOM)
- Cleanup/disposal infrastructure for component unmount
- Memory leak prevention (automatic subscription cleanup)

### Files to create

- `packages/ui/src/runtime/signal.ts`
- `packages/ui/src/runtime/signal-types.ts`
- `packages/ui/src/runtime/scheduler.ts`
- `packages/ui/src/runtime/tracking.ts`
- `packages/ui/src/runtime/disposal.ts`
- `packages/ui/src/dom/element.ts`
- `packages/ui/src/dom/attributes.ts`
- `packages/ui/src/dom/events.ts`
- `packages/ui/src/dom/conditional.ts`
- `packages/ui/src/dom/list.ts`
- `packages/ui/src/dom/insert.ts`
- All corresponding `__tests__/` files

### References

- [Implementation Plan — Phase 1A](../../plans/ui-implementation.md#sub-phase-1a-reactivity-runtime-p1-1)
- [UI Design Doc](../../plans/ui-design.md)
- [Reactive Mutations Compiler Design](../../../backstage/research/explorations/reactive-mutations-compiler-design.md)

## Acceptance Criteria

- [ ] `signal<T>(initial)` creates a reactive container with `.value` getter/setter
- [ ] `.peek()` reads value without subscribing
- [ ] `.notify()` triggers subscribers after in-place mutation
- [ ] `computed<T>(fn)` derives values lazily with diamond dependency deduplication
- [ ] `effect(fn)` re-runs on dependency changes with automatic tracking
- [ ] `batch(fn)` groups multiple writes into a single flush
- [ ] `untrack(fn)` reads signals without creating subscriptions
- [ ] `__text()` creates reactive text nodes that update on signal change
- [ ] `__element()` creates DOM elements
- [ ] `__attr()`, `__show()`, `__classList()` bind reactive attributes
- [ ] `__on()` binds event handlers
- [ ] `__conditional()` handles ternary/if expressions in JSX
- [ ] `__list()` performs keyed reconciliation with DOM node reuse on reorder
- [ ] Disposal cleans up all subscriptions on unmount
- [ ] No memory leaks — subscriptions are automatically cleaned up
- [ ] Integration tests pass (see below)

### Integration Tests

```typescript
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

// IT-1A-3: Diamond dependency deduplication — computed fires once, not twice
test('diamond dependency deduplicates updates', () => {
  const a = signal(1);
  const b = computed(() => a.value * 2);
  const c = computed(() => a.value * 3);
  const d = computed(() => b.value + c.value);

  let callCount = 0;
  effect(() => { d.value; callCount++; });
  callCount = 0; // reset after initial run

  a.value = 2;
  expect(d.value).toBe(10); // 4 + 6
  expect(callCount).toBe(1); // fired once, not twice
});

// IT-1A-4: Keyed list reconciliation preserves DOM nodes on reorder
test('__list reorders DOM nodes without recreating them', () => {
  const items = signal([{ id: 1, text: 'A' }, { id: 2, text: 'B' }, { id: 3, text: 'C' }]);
  const container = document.createElement('ul');
  __list(container, items, (item) => item.id, (item) => {
    const li = document.createElement('li');
    li.textContent = item.text;
    return li;
  });

  const originalNodes = [...container.children];
  items.value = [{ id: 3, text: 'C' }, { id: 1, text: 'A' }, { id: 2, text: 'B' }];

  expect(container.children[0]).toBe(originalNodes[2]); // C moved to front, same DOM node
  expect(container.children[1]).toBe(originalNodes[0]); // A moved to middle, same DOM node
});

// IT-1A-5: batch() groups multiple writes into a single flush
test('batch groups updates into one flush', () => {
  const a = signal(1);
  const b = signal(2);
  let flushCount = 0;
  effect(() => { a.value + b.value; flushCount++; });
  flushCount = 0;

  batch(() => { a.value = 10; b.value = 20; });
  expect(flushCount).toBe(1);
});

// IT-1A-6: Disposal cleans up subscriptions on unmount
test('disposal cleans up all subscriptions', () => {
  const count = signal(0);
  let effectRuns = 0;
  const dispose = effect(() => { count.value; effectRuns++; });
  effectRuns = 0;

  count.value = 1;
  expect(effectRuns).toBe(1);

  dispose();
  count.value = 2;
  expect(effectRuns).toBe(1); // no additional run after disposal
});

// IT-1A-7: signal.notify() triggers subscribers after in-place mutation
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
```

## Progress

- 2026-02-10: Ticket created from implementation plan.
