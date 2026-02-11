import { describe, expect, it } from 'vitest';
import { batch } from '../scheduler';
import { computed, effect, signal } from '../signal';
import { untrack } from '../tracking';

describe('signal', () => {
  it('holds an initial value', () => {
    const s = signal(42);
    expect(s.value).toBe(42);
  });

  it('updates value on assignment', () => {
    const s = signal(0);
    s.value = 10;
    expect(s.value).toBe(10);
  });

  it('peek() reads without tracking', () => {
    const s = signal(5);
    let effectRuns = 0;
    effect(() => {
      s.peek();
      effectRuns++;
    });
    effectRuns = 0;
    s.value = 10;
    expect(effectRuns).toBe(0);
  });

  it('does not notify when value is the same (Object.is)', () => {
    const s = signal(1);
    let effectRuns = 0;
    effect(() => {
      s.value;
      effectRuns++;
    });
    effectRuns = 0;
    s.value = 1;
    expect(effectRuns).toBe(0);
  });

  it('notify() triggers subscribers even without value change', () => {
    const items = signal([1, 2, 3]);
    let effectRuns = 0;
    effect(() => {
      items.value;
      effectRuns++;
    });
    effectRuns = 0;
    items.peek().push(4);
    items.notify();
    expect(effectRuns).toBe(1);
  });
});

describe('computed', () => {
  it('derives a value from a signal', () => {
    const s = signal(2);
    const doubled = computed(() => s.value * 2);
    expect(doubled.value).toBe(4);
  });

  it('updates when dependency changes', () => {
    const s = signal(3);
    const tripled = computed(() => s.value * 3);
    expect(tripled.value).toBe(9);
    s.value = 4;
    expect(tripled.value).toBe(12);
  });

  it('chains transitively', () => {
    const a = signal(1);
    const b = computed(() => a.value + 1);
    const c = computed(() => b.value * 2);
    expect(c.value).toBe(4);
    a.value = 5;
    expect(c.value).toBe(12);
  });

  it('peek() reads without tracking', () => {
    const s = signal(10);
    const c = computed(() => s.value * 2);
    let effectRuns = 0;
    effect(() => {
      c.peek();
      effectRuns++;
    });
    effectRuns = 0;
    s.value = 20;
    expect(effectRuns).toBe(0);
    expect(c.peek()).toBe(40);
  });
});

describe('effect', () => {
  it('runs immediately on creation', () => {
    let ran = false;
    effect(() => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it('re-runs when dependency changes', () => {
    const s = signal(0);
    let observed = -1;
    effect(() => {
      observed = s.value;
    });
    expect(observed).toBe(0);
    s.value = 42;
    expect(observed).toBe(42);
  });

  it('returns a dispose function that stops re-running', () => {
    const s = signal(0);
    let effectRuns = 0;
    const dispose = effect(() => {
      s.value;
      effectRuns++;
    });
    effectRuns = 0;
    s.value = 1;
    expect(effectRuns).toBe(1);
    dispose();
    s.value = 2;
    expect(effectRuns).toBe(1);
  });
});

describe('batch', () => {
  it('groups multiple signal writes into one flush', () => {
    const a = signal(1);
    const b = signal(2);
    let flushCount = 0;
    effect(() => {
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

  it('supports nested batches', () => {
    const s = signal(0);
    let flushCount = 0;
    effect(() => {
      s.value;
      flushCount++;
    });
    flushCount = 0;
    batch(() => {
      s.value = 1;
      batch(() => {
        s.value = 2;
      });
      s.value = 3;
    });
    expect(flushCount).toBe(1);
    expect(s.value).toBe(3);
  });
});

describe('untrack', () => {
  it('reads signal without subscribing', () => {
    const s = signal(0);
    let effectRuns = 0;
    effect(() => {
      untrack(() => s.value);
      effectRuns++;
    });
    effectRuns = 0;
    s.value = 10;
    expect(effectRuns).toBe(0);
  });
});

describe('diamond dependency', () => {
  it('deduplicates updates through diamond graph', () => {
    const a = signal(1);
    const b = computed(() => a.value * 2);
    const c = computed(() => a.value * 3);
    const d = computed(() => b.value + c.value);
    let callCount = 0;
    effect(() => {
      d.value;
      callCount++;
    });
    callCount = 0;
    a.value = 2;
    expect(d.value).toBe(10);
    expect(callCount).toBe(1);
  });
});
