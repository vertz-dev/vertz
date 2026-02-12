import { describe, expect, test } from 'vitest';
import { onCleanup, popScope, pushScope, runCleanups } from '../../runtime/disposal';
import { signal } from '../../runtime/signal';
import { onMount, watch } from '../lifecycle';

describe('onMount', () => {
  test('runs callback immediately within a disposal scope', () => {
    let mounted = false;
    pushScope();
    onMount(() => {
      mounted = true;
    });
    popScope();
    expect(mounted).toBe(true);
  });

  test('onCleanup inside onMount runs on scope disposal', () => {
    let cleaned = false;
    const scope = pushScope();
    onMount(() => {
      onCleanup(() => {
        cleaned = true;
      });
    });
    popScope();
    expect(cleaned).toBe(false);
    runCleanups(scope);
    expect(cleaned).toBe(true);
  });

  test('onMount runs exactly once and does not re-execute', () => {
    let mountCount = 0;
    const count = signal(0);
    pushScope();
    onMount(() => {
      // Read a signal inside onMount — should NOT cause re-execution
      count.value;
      mountCount++;
    });
    popScope();
    expect(mountCount).toBe(1);
    count.value = 1;
    count.value = 2;
    // Should still be 1 — onMount never re-runs
    expect(mountCount).toBe(1);
  });
});

describe('watch', () => {
  test('runs callback immediately with current value', () => {
    const values: number[] = [];
    const count = signal(0);
    pushScope();
    watch(
      () => count.value,
      (val) => values.push(val),
    );
    popScope();
    expect(values).toEqual([0]);
  });

  test('re-runs callback when dependency changes', () => {
    const values: number[] = [];
    const count = signal(0);
    pushScope();
    watch(
      () => count.value,
      (val) => values.push(val),
    );
    popScope();
    count.value = 1;
    expect(values).toEqual([0, 1]);
  });

  test('disposes when scope is cleaned up', () => {
    const values: number[] = [];
    const count = signal(0);
    const scope = pushScope();
    watch(
      () => count.value,
      (val) => values.push(val),
    );
    popScope();
    count.value = 1;
    expect(values).toEqual([0, 1]);
    runCleanups(scope);
    count.value = 2;
    // After disposal, watch should not run anymore
    expect(values).toEqual([0, 1]);
  });

  test('onCleanup inside watch runs before each re-run', () => {
    const log: string[] = [];
    const count = signal(0);
    pushScope();
    watch(
      () => count.value,
      (val) => {
        onCleanup(() => {
          log.push(`cleanup-${val}`);
        });
        log.push(`run-${val}`);
      },
    );
    popScope();
    expect(log).toEqual(['run-0']);
    count.value = 1;
    // Previous cleanup runs before new run
    expect(log).toEqual(['run-0', 'cleanup-0', 'run-1']);
    count.value = 2;
    expect(log).toEqual(['run-0', 'cleanup-0', 'run-1', 'cleanup-1', 'run-2']);
  });

  test('onCleanup inside watch runs on final disposal', () => {
    const log: string[] = [];
    const count = signal(0);
    const scope = pushScope();
    watch(
      () => count.value,
      (val) => {
        onCleanup(() => {
          log.push(`cleanup-${val}`);
        });
        log.push(`run-${val}`);
      },
    );
    popScope();
    expect(log).toEqual(['run-0']);
    // Dispose without any re-runs
    runCleanups(scope);
    expect(log).toEqual(['run-0', 'cleanup-0']);
  });
});

describe('onCleanup LIFO ordering', () => {
  test('cleanup handlers run in reverse registration order', () => {
    const order: number[] = [];
    const scope = pushScope();
    onCleanup(() => order.push(1));
    onCleanup(() => order.push(2));
    onCleanup(() => order.push(3));
    popScope();
    runCleanups(scope);
    expect(order).toEqual([3, 2, 1]);
  });
});
