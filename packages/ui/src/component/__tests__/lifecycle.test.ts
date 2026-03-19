import { afterEach, describe, expect, test } from 'bun:test';
import { onCleanup, popScope, pushScope, runCleanups } from '../../runtime/disposal';
import { signal } from '../../runtime/signal';
import { registerSSRResolver } from '../../ssr/ssr-render-context';
import { __discardMountFrame, __flushMountFrame, __pushMountFrame, onMount } from '../lifecycle';

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

describe('Mount frame stack', () => {
  describe('Given an active mount frame', () => {
    test('When onMount is called, Then defers the callback until __flushMountFrame', () => {
      let ran = false;
      __pushMountFrame();
      onMount(() => {
        ran = true;
      });
      expect(ran).toBe(false);
      __flushMountFrame();
      expect(ran).toBe(true);
    });
  });

  describe('Given no active mount frame', () => {
    test('When onMount is called, Then runs the callback immediately (backward compat)', () => {
      let ran = false;
      onMount(() => {
        ran = true;
      });
      expect(ran).toBe(true);
    });
  });

  describe('Given nested mount frames (parent + child)', () => {
    test('When both are flushed, Then child callbacks run on child flush, parent on parent flush', () => {
      const order: string[] = [];
      __pushMountFrame(); // parent frame
      onMount(() => order.push('parent'));

      __pushMountFrame(); // child frame
      onMount(() => order.push('child'));
      __flushMountFrame(); // flush child
      expect(order).toEqual(['child']);

      __flushMountFrame(); // flush parent
      expect(order).toEqual(['child', 'parent']);
    });
  });

  describe('Given a mount frame where a callback throws', () => {
    test('When __flushMountFrame is called, Then the frame is still popped (no leak)', () => {
      __pushMountFrame();
      onMount(() => {
        throw new Error('boom');
      });
      expect(() => __flushMountFrame()).toThrow('boom');
      // Stack should be clean — pushing and flushing a new frame should work
      __pushMountFrame();
      let ran = false;
      onMount(() => {
        ran = true;
      });
      __flushMountFrame();
      expect(ran).toBe(true);
    });

    test('When __flushMountFrame is called, Then all remaining callbacks still execute', () => {
      let firstRan = false;
      let thirdRan = false;
      __pushMountFrame();
      onMount(() => {
        firstRan = true;
      });
      onMount(() => {
        throw new Error('boom');
      });
      onMount(() => {
        thirdRan = true;
      });
      expect(() => __flushMountFrame()).toThrow('boom');
      expect(firstRan).toBe(true);
      expect(thirdRan).toBe(true);
    });

    test('When __flushMountFrame is called, Then the first error is rethrown after all callbacks run', () => {
      __pushMountFrame();
      onMount(() => {
        throw new Error('first');
      });
      onMount(() => {
        throw new Error('second');
      });
      expect(() => __flushMountFrame()).toThrow('first');
    });
  });

  describe('Given __discardMountFrame called after __flushMountFrame', () => {
    test('When the frame was already popped by flush, Then __discardMountFrame is a safe no-op', () => {
      __pushMountFrame();
      __flushMountFrame();
      // Should not throw or pop a parent frame
      expect(() => __discardMountFrame()).not.toThrow();
    });
  });

  describe('Given a deferred onMount with cleanup return', () => {
    test('When the scope is disposed, Then cleanup runs', () => {
      let cleaned = false;
      const scope = pushScope();
      __pushMountFrame();
      onMount(() => {
        return () => {
          cleaned = true;
        };
      });
      __flushMountFrame();
      popScope();
      expect(cleaned).toBe(false);
      runCleanups(scope);
      expect(cleaned).toBe(true);
    });
  });

  describe('Given SSR context is active', () => {
    afterEach(() => {
      registerSSRResolver(null);
    });

    test('When onMount is called with an active frame, Then callback is not deferred and not executed', () => {
      const fakeCtx = { url: '/' } as any;
      registerSSRResolver(() => fakeCtx);
      let ran = false;
      __pushMountFrame();
      onMount(() => {
        ran = true;
      });
      __flushMountFrame();
      expect(ran).toBe(false);
    });
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
