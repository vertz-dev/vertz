import { describe, expect, it, vi } from 'vitest';
import { onCleanup, onMount, watch } from './lifecycle';
import { signal } from './signal';

describe('watch() — mount-only form', () => {
  it('runs the callback once immediately', () => {
    const fn = vi.fn();
    const dispose = watch(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('does not re-run when unrelated signals change', () => {
    const s = signal(0);
    const fn = vi.fn(() => {
      s.get(); // read signal inside watch
    });
    const dispose = watch(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    s.set(1);
    // Mount-only form should NOT re-run
    expect(fn).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('runs onCleanup on dispose', () => {
    const cleanupFn = vi.fn();
    const dispose = watch(() => {
      onCleanup(cleanupFn);
    });
    expect(cleanupFn).not.toHaveBeenCalled();
    dispose();
    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });
});

describe('watch() — dependency form', () => {
  it('runs callback immediately with current dep value', () => {
    const s = signal(42);
    const fn = vi.fn();
    const dispose = watch(() => s.get(), fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(42);
    dispose();
  });

  it('re-runs callback when dependency changes', () => {
    const s = signal(0);
    const values: number[] = [];
    const dispose = watch(
      () => s.get(),
      (val) => {
        values.push(val);
      },
    );
    expect(values).toEqual([0]);

    s.set(1);
    expect(values).toEqual([0, 1]);

    s.set(5);
    expect(values).toEqual([0, 1, 5]);
    dispose();
  });

  it('runs onCleanup before each re-execution', () => {
    const s = signal('a');
    const log: string[] = [];

    const dispose = watch(
      () => s.get(),
      (val) => {
        log.push(`run:${val}`);
        onCleanup(() => {
          log.push(`cleanup:${val}`);
        });
      },
    );

    expect(log).toEqual(['run:a']);

    s.set('b');
    expect(log).toEqual(['run:a', 'cleanup:a', 'run:b']);

    dispose();
    expect(log).toEqual(['run:a', 'cleanup:a', 'run:b', 'cleanup:b']);
  });

  it('tracks multiple signals in the dependency expression', () => {
    const a = signal(1);
    const b = signal(2);
    const values: number[] = [];

    const dispose = watch(
      () => a.get() + b.get(),
      (sum) => {
        values.push(sum);
      },
    );

    expect(values).toEqual([3]);

    a.set(10);
    expect(values).toEqual([3, 12]);

    b.set(20);
    expect(values).toEqual([3, 12, 30]);
    dispose();
  });

  it('does NOT cause infinite loop with reactive write inside callback', () => {
    const source = signal(0);
    const derived = signal(0);
    let runCount = 0;

    const dispose = watch(
      () => source.get(),
      (val) => {
        runCount++;
        // Writing to a DIFFERENT signal inside watch callback
        // should NOT cause infinite loop because derived is not tracked by this watch
        derived.set(val * 2);
      },
    );

    expect(runCount).toBe(1);
    expect(derived.get()).toBe(0);

    source.set(5);
    expect(runCount).toBe(2);
    expect(derived.get()).toBe(10);

    dispose();
  });

  it('DOES cause re-run if callback writes to the watched signal (self-loop)', () => {
    // This validates that writing to the SAME signal that is tracked
    // WILL cause a re-run. We need to detect this pattern.
    const s = signal(0);
    let runCount = 0;
    const _MAX_RUNS = 10;

    const dispose = watch(
      () => s.get(),
      (val) => {
        runCount++;
        // Only loop a finite number of times to avoid hanging the test
        if (val < 3) {
          s.set(val + 1);
        }
      },
    );

    // It should run 4 times: val=0, val=1, val=2, val=3 (stops incrementing)
    expect(runCount).toBe(4);
    expect(s.get()).toBe(3);

    dispose();
  });
});

describe('onMount()', () => {
  it('runs the function once immediately', () => {
    const fn = vi.fn();
    const dispose = onMount(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('runs returned cleanup on dispose', () => {
    const cleanup = vi.fn();
    const dispose = onMount(() => cleanup);
    expect(cleanup).not.toHaveBeenCalled();
    dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('runs onCleanup registered inside onMount', () => {
    const cleanup = vi.fn();
    const dispose = onMount(() => {
      onCleanup(cleanup);
    });
    expect(cleanup).not.toHaveBeenCalled();
    dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

describe('watch() — infinite loop prevention', () => {
  it('writing to a different signal in callback does not loop', () => {
    const input = signal('hello');
    const output = signal('');
    let runs = 0;

    const dispose = watch(
      () => input.get(),
      (val) => {
        runs++;
        output.set(val.toUpperCase());
      },
    );

    expect(runs).toBe(1);
    expect(output.get()).toBe('HELLO');

    input.set('world');
    expect(runs).toBe(2);
    expect(output.get()).toBe('WORLD');

    dispose();
  });
});
