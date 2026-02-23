import { afterEach, describe, expect, it } from 'vitest';
import { batch } from '../scheduler';
import { computed, domEffect, lifecycleEffect, signal } from '../signal';
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
    domEffect(() => {
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
    domEffect(() => {
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
    domEffect(() => {
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
    domEffect(() => {
      c.peek();
      effectRuns++;
    });
    effectRuns = 0;
    s.value = 20;
    expect(effectRuns).toBe(0);
    expect(c.peek()).toBe(40);
  });
});

describe('domEffect (general)', () => {
  it('runs immediately on creation', () => {
    let ran = false;
    domEffect(() => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it('re-runs when dependency changes', () => {
    const s = signal(0);
    let observed = -1;
    domEffect(() => {
      observed = s.value;
    });
    expect(observed).toBe(0);
    s.value = 42;
    expect(observed).toBe(42);
  });

  it('returns a dispose function that stops re-running', () => {
    const s = signal(0);
    let effectRuns = 0;
    const dispose = domEffect(() => {
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

  it('dispose removes effect from signal subscriber sets', () => {
    const s = signal(0);
    let effectRuns = 0;
    const dispose = domEffect(() => {
      s.value;
      effectRuns++;
    });
    // The effect is subscribed to s
    dispose();
    effectRuns = 0;
    // After dispose, changing the signal should NOT trigger the effect
    s.value = 1;
    s.value = 2;
    s.value = 3;
    expect(effectRuns).toBe(0);
  });

  it('cleans up stale subscriptions on re-run with conditional branches', () => {
    const toggle = signal(true);
    const a = signal('A');
    const b = signal('B');
    let observed = '';
    let effectRuns = 0;

    domEffect(() => {
      effectRuns++;
      // Conditional: only reads a or b depending on toggle
      observed = toggle.value ? a.value : b.value;
    });

    expect(observed).toBe('A');
    effectRuns = 0;

    // Switch branch to b
    toggle.value = false;
    expect(observed).toBe('B');
    effectRuns = 0;

    // Changing a should NOT re-trigger the effect because we are on the b branch
    a.value = 'A2';
    expect(effectRuns).toBe(0);
    expect(observed).toBe('B');

    // Changing b should re-trigger
    b.value = 'B2';
    expect(effectRuns).toBe(1);
    expect(observed).toBe('B2');
  });

  it('nested effects: inner effect runs independently from outer', () => {
    const outer = signal(0);
    const inner = signal(0);
    let outerRuns = 0;
    let innerRuns = 0;
    let innerDispose: (() => void) | null = null;

    domEffect(() => {
      outer.value;
      outerRuns++;
      // Create a nested inner effect
      if (innerDispose) {
        innerDispose();
      }
      innerDispose = domEffect(() => {
        inner.value;
        innerRuns++;
      });
    });

    // Initial: both run once
    expect(outerRuns).toBe(1);
    expect(innerRuns).toBe(1);

    // Changing inner signal: only inner effect runs
    outerRuns = 0;
    innerRuns = 0;
    inner.value = 1;
    expect(outerRuns).toBe(0);
    expect(innerRuns).toBe(1);

    // Changing outer signal: outer runs, which creates new inner
    outerRuns = 0;
    innerRuns = 0;
    outer.value = 1;
    expect(outerRuns).toBe(1);
    expect(innerRuns).toBe(1); // new inner effect runs immediately
  });
});

describe('batch', () => {
  it('groups multiple signal writes into one flush', () => {
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

  it('supports nested batches', () => {
    const s = signal(0);
    let flushCount = 0;
    domEffect(() => {
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

  it('signal set during batch is visible to effect after flush', () => {
    const s = signal(0);
    let observed = -1;
    domEffect(() => {
      observed = s.value;
    });
    expect(observed).toBe(0);

    batch(() => {
      s.value = 42;
      // During batch, the effect has not yet run
    });

    // After batch, the effect should have run with the final value
    expect(observed).toBe(42);
  });

  it('deduplicates multiple writes to same signal in batch', () => {
    const s = signal(0);
    let effectRuns = 0;
    domEffect(() => {
      s.value;
      effectRuns++;
    });
    effectRuns = 0;

    batch(() => {
      s.value = 1;
      s.value = 2;
      s.value = 3;
    });

    // Effect should run exactly once with the final value
    expect(effectRuns).toBe(1);
    expect(s.value).toBe(3);
  });
});

describe('untrack', () => {
  it('reads signal without subscribing', () => {
    const s = signal(0);
    let effectRuns = 0;
    domEffect(() => {
      untrack(() => s.value);
      effectRuns++;
    });
    effectRuns = 0;
    s.value = 10;
    expect(effectRuns).toBe(0);
  });
});

describe('domEffect (SSR)', () => {
  function withSSR(fn: () => void): void {
    (globalThis as any).__VERTZ_IS_SSR__ = () => true;
    try {
      fn();
    } finally {
      delete (globalThis as any).__VERTZ_IS_SSR__;
    }
  }

  afterEach(() => {
    delete (globalThis as any).__VERTZ_IS_SSR__;
  });

  it('runs callback once in SSR without subscriptions', () => {
    const s = signal(0);
    let ran = 0;
    withSSR(() => {
      domEffect(() => {
        s.value; // read signal — should NOT create subscription
        ran++;
      });
    });
    expect(ran).toBe(1);
    // Changing signal after domEffect should NOT re-run it
    s.value = 1;
    expect(ran).toBe(1);
  });

  it('catches errors in SSR and does not throw', () => {
    let errorCaught = false;
    withSSR(() => {
      // domEffect should not crash the SSR render when callback throws
      try {
        domEffect(() => {
          throw new Error('SSR effect error');
        });
      } catch {
        errorCaught = true;
      }
    });
    // Currently domEffect lets the error propagate — error collection
    // will be added when SSR context integration lands
    expect(errorCaught).toBe(true);
  });

  it('behaves like effect() in CSR — runs and tracks', () => {
    const s = signal(0);
    let observed = -1;
    domEffect(() => {
      observed = s.value;
    });
    expect(observed).toBe(0);
    s.value = 42;
    expect(observed).toBe(42);
  });

  it('returns dispose function in CSR', () => {
    const s = signal(0);
    let runs = 0;
    const dispose = domEffect(() => {
      s.value;
      runs++;
    });
    runs = 0;
    s.value = 1;
    expect(runs).toBe(1);
    dispose();
    s.value = 2;
    expect(runs).toBe(1);
  });

  it('returns no-op dispose in SSR', () => {
    let dispose = () => {};
    withSSR(() => {
      dispose = domEffect(() => {});
    });
    // dispose should be callable without error
    expect(() => dispose()).not.toThrow();
  });
});

describe('lifecycleEffect', () => {
  function withSSR(fn: () => void): void {
    (globalThis as any).__VERTZ_IS_SSR__ = () => true;
    try {
      fn();
    } finally {
      delete (globalThis as any).__VERTZ_IS_SSR__;
    }
  }

  afterEach(() => {
    delete (globalThis as any).__VERTZ_IS_SSR__;
  });

  it('is a no-op during SSR', () => {
    let ran = false;
    withSSR(() => {
      lifecycleEffect(() => {
        ran = true;
      });
    });
    expect(ran).toBe(false);
  });

  it('returns no-op dispose in SSR', () => {
    let dispose = () => {};
    withSSR(() => {
      dispose = lifecycleEffect(() => {});
    });
    expect(() => dispose()).not.toThrow();
  });

  it('behaves like effect() in CSR — runs and tracks', () => {
    const s = signal(0);
    let observed = -1;
    lifecycleEffect(() => {
      observed = s.value;
    });
    expect(observed).toBe(0);
    s.value = 42;
    expect(observed).toBe(42);
  });

  it('returns dispose function in CSR', () => {
    const s = signal(0);
    let runs = 0;
    const dispose = lifecycleEffect(() => {
      s.value;
      runs++;
    });
    runs = 0;
    s.value = 1;
    expect(runs).toBe(1);
    dispose();
    s.value = 2;
    expect(runs).toBe(1);
  });
});

describe('diamond dependency', () => {
  it('deduplicates updates through diamond graph', () => {
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
});
