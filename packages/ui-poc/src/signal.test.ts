import { describe, expect, it, vi } from 'vitest';
import { _getActiveEffect, batch, computed, effect, signal } from './signal';

describe('signal()', () => {
  it('stores and returns initial value', () => {
    const s = signal(42);
    expect(s.get()).toBe(42);
  });

  it('updates value via set()', () => {
    const s = signal(0);
    s.set(10);
    expect(s.get()).toBe(10);
  });

  it('updates value via update()', () => {
    const s = signal(5);
    s.update((v) => v + 3);
    expect(s.get()).toBe(8);
  });

  it('skips notification when value is the same (Object.is)', () => {
    const s = signal(42);
    const fn = vi.fn();
    s.subscribe(fn);
    s.set(42);
    expect(fn).not.toHaveBeenCalled();
  });

  it('handles NaN equality correctly', () => {
    const s = signal(Number.NaN);
    const fn = vi.fn();
    s.subscribe(fn);
    s.set(Number.NaN);
    expect(fn).not.toHaveBeenCalled();
  });

  it('notifies subscribers on change', () => {
    const s = signal(0);
    const fn = vi.fn();
    s.subscribe(fn);
    s.set(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes correctly', () => {
    const s = signal(0);
    const fn = vi.fn();
    const unsub = s.subscribe(fn);
    unsub();
    s.set(1);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('computed()', () => {
  it('derives a value from a signal', () => {
    const count = signal(3);
    const doubled = computed(() => count.get() * 2);
    expect(doubled.get()).toBe(6);
  });

  it('updates when the source signal changes', () => {
    const count = signal(1);
    const doubled = computed(() => count.get() * 2);
    expect(doubled.get()).toBe(2);
    count.set(5);
    expect(doubled.get()).toBe(10);
  });

  it('chains computed values', () => {
    const a = signal(2);
    const b = computed(() => a.get() + 1);
    const c = computed(() => b.get() * 3);
    expect(c.get()).toBe(9);
    a.set(10);
    expect(c.get()).toBe(33);
  });

  it('is lazy: does not compute until read', () => {
    const fn = vi.fn(() => 42);
    const c = computed(fn);
    expect(fn).not.toHaveBeenCalled();
    c.get();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('caches result when dependencies have not changed', () => {
    const s = signal(1);
    const fn = vi.fn(() => s.get() * 2);
    const c = computed(fn);
    c.get();
    c.get();
    c.get();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('effect()', () => {
  it('runs immediately on creation', () => {
    const fn = vi.fn();
    const dispose = effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('re-runs when a tracked signal changes', () => {
    const s = signal(0);
    const values: number[] = [];
    const dispose = effect(() => {
      values.push(s.get());
    });
    expect(values).toEqual([0]);
    s.set(1);
    expect(values).toEqual([0, 1]);
    s.set(2);
    expect(values).toEqual([0, 1, 2]);
    dispose();
  });

  it('runs cleanup before re-execution', () => {
    const s = signal(0);
    const log: string[] = [];
    const dispose = effect(() => {
      const val = s.get();
      log.push(`run:${val}`);
      return () => {
        log.push(`cleanup:${val}`);
      };
    });
    expect(log).toEqual(['run:0']);
    s.set(1);
    expect(log).toEqual(['run:0', 'cleanup:0', 'run:1']);
    dispose();
    expect(log).toEqual(['run:0', 'cleanup:0', 'run:1', 'cleanup:1']);
  });

  it('does not track signals read outside the effect', () => {
    const tracked = signal(0);
    const untracked = signal(0);
    untracked.get(); // read outside effect
    const fn = vi.fn(() => {
      tracked.get();
    });
    const dispose = effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    untracked.set(1);
    expect(fn).toHaveBeenCalledTimes(1); // should not re-run
    tracked.set(1);
    expect(fn).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('tracks computed values and updates when underlying signal changes', () => {
    const s = signal(3);
    const doubled = computed(() => s.get() * 2);
    const values: number[] = [];
    const dispose = effect(() => {
      values.push(doubled.get());
    });
    expect(values).toEqual([6]);
    s.set(5);
    expect(values).toEqual([6, 10]);
    dispose();
  });

  it('cleans up active effect context after execution', () => {
    expect(_getActiveEffect()).toBeNull();
    const dispose = effect(() => {
      // inside effect, activeEffect is set
    });
    expect(_getActiveEffect()).toBeNull();
    dispose();
  });
});

describe('batch()', () => {
  it('defers subscriber notifications until batch completes', () => {
    const s = signal(0);
    const fn = vi.fn();
    s.subscribe(fn);

    batch(() => {
      s.set(1);
      s.set(2);
      s.set(3);
      expect(fn).not.toHaveBeenCalled();
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('batches effect re-runs', () => {
    const a = signal(0);
    const b = signal(0);
    const values: string[] = [];

    const dispose = effect(() => {
      values.push(`${a.get()},${b.get()}`);
    });

    expect(values).toEqual(['0,0']);

    batch(() => {
      a.set(1);
      b.set(1);
    });

    // Effect runs once with both updated values, not twice
    expect(values).toEqual(['0,0', '1,1']);
    dispose();
  });

  it('supports nested batches', () => {
    const s = signal(0);
    const fn = vi.fn();
    s.subscribe(fn);

    batch(() => {
      s.set(1);
      batch(() => {
        s.set(2);
      });
      // Inner batch should NOT flush yet
      expect(fn).not.toHaveBeenCalled();
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('diamond dependency', () => {
  it('computed handles diamond graph without glitches when batched', () => {
    const source = signal(1);
    const left = computed(() => source.get() + 1);
    const right = computed(() => source.get() * 2);
    const bottom = computed(() => left.get() + right.get());

    expect(bottom.get()).toBe(4); // (1+1) + (1*2) = 4

    source.set(2);
    // Should be (2+1) + (2*2) = 7, not a glitched intermediate
    expect(bottom.get()).toBe(7);
  });
});
