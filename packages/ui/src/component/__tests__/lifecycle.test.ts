import { describe, expect, test } from 'bun:test';
import { onCleanup, popScope, pushScope, runCleanups } from '../../runtime/disposal';
import { signal } from '../../runtime/signal';
import { onMount } from '../lifecycle';

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

  test('return-cleanup runs on scope disposal', () => {
    let cleaned = false;
    const scope = pushScope();
    onMount(() => {
      return () => {
        cleaned = true;
      };
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

describe('onMount edge cases', () => {
  test('nested onMount with return-cleanup in both levels', () => {
    const log: string[] = [];
    const scope = pushScope();
    onMount(() => {
      onMount(() => {
        return () => log.push('inner cleanup');
      });
      return () => log.push('outer cleanup');
    });
    popScope();
    expect(log).toEqual([]);
    runCleanups(scope);
    // Both cleanups should run
    expect(log).toContain('outer cleanup');
    expect(log).toContain('inner cleanup');
  });

  test('cleanup is forwarded to parent scope even if callback throws', () => {
    let cleaned = false;
    const scope = pushScope();
    expect(() => {
      onMount(() => {
        onCleanup(() => {
          cleaned = true;
        });
        throw new Error('boom');
      });
    }).toThrow('boom');
    popScope();
    expect(cleaned).toBe(false);
    runCleanups(scope);
    expect(cleaned).toBe(true);
  });

  test('onMount without parent scope silently discards cleanups', () => {
    // When onMount is called without a parent scope (no pushScope()),
    // _tryOnCleanup silently discards the forwarded cleanups.
    // This matches watch() behavior — no error, just no-op.
    let cleaned = false;
    expect(() => {
      onMount(() => {
        return () => {
          cleaned = true;
        };
      });
    }).not.toThrow();
    // Cleanup was discarded — no parent scope to attach to
    expect(cleaned).toBe(false);
  });
});

describe('onMount return-cleanup', () => {
  test('returned function is registered as cleanup', () => {
    let cleaned = false;
    const scope = pushScope();
    onMount(() => {
      return () => {
        cleaned = true;
      };
    });
    popScope();
    expect(cleaned).toBe(false);
    runCleanups(scope);
    expect(cleaned).toBe(true);
  });

  test('returning undefined does not register cleanup', () => {
    const scope = pushScope();
    // Should not throw when callback returns undefined
    expect(() => {
      onMount(() => {
        // no return
      });
    }).not.toThrow();
    popScope();
    // Clean disposal should work fine
    expect(() => runCleanups(scope)).not.toThrow();
  });

  test('return-cleanup is the only cleanup mechanism for onMount', () => {
    const log: string[] = [];
    const scope = pushScope();
    onMount(() => {
      return () => log.push('return-cleanup');
    });
    popScope();
    expect(log).toEqual([]);
    runCleanups(scope);
    expect(log).toEqual(['return-cleanup']);
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
