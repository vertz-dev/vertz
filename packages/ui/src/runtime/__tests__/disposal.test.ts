import { describe, expect, it } from 'vitest';
import {
  _tryOnCleanup,
  DisposalScopeError,
  onCleanup,
  popScope,
  pushScope,
  runCleanups,
} from '../disposal';

describe('onCleanup outside disposal scope', () => {
  it('throws DisposalScopeError when called outside any scope', () => {
    expect(() => {
      onCleanup(() => {});
    }).toThrow(DisposalScopeError);
  });

  it('throws an error message stating onCleanup must be called within a disposal scope', () => {
    expect(() => {
      onCleanup(() => {});
    }).toThrow(/onCleanup\(\) must be called within a disposal scope/);
  });

  it('thrown error is an instance of Error', () => {
    let caught: unknown;
    try {
      onCleanup(() => {});
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).toBeInstanceOf(DisposalScopeError);
  });
});

describe('onCleanup inside disposal scope', () => {
  it('registers the callback and runs it on scope disposal', () => {
    let cleaned = false;
    const scope = pushScope();
    onCleanup(() => {
      cleaned = true;
    });
    popScope();

    expect(cleaned).toBe(false);
    runCleanups(scope);
    expect(cleaned).toBe(true);
  });

  it('registers multiple callbacks that run in LIFO order', () => {
    const order: number[] = [];
    const scope = pushScope();
    onCleanup(() => order.push(1));
    onCleanup(() => order.push(2));
    onCleanup(() => order.push(3));
    popScope();

    runCleanups(scope);
    expect(order).toEqual([3, 2, 1]);
  });

  it('works in nested scopes', () => {
    const outerLog: string[] = [];
    const innerLog: string[] = [];

    const outerScope = pushScope();
    onCleanup(() => outerLog.push('outer'));

    const innerScope = pushScope();
    onCleanup(() => innerLog.push('inner'));
    popScope();

    popScope();

    runCleanups(innerScope);
    expect(innerLog).toEqual(['inner']);
    expect(outerLog).toEqual([]);

    runCleanups(outerScope);
    expect(outerLog).toEqual(['outer']);
  });
});

describe('_tryOnCleanup (internal, silent variant)', () => {
  it('does NOT throw when called outside any scope', () => {
    expect(() => {
      _tryOnCleanup(() => {});
    }).not.toThrow();
  });

  it('silently discards the callback when no scope is active', () => {
    let called = false;
    _tryOnCleanup(() => {
      called = true;
    });
    // No scope to run cleanups on — callback was discarded
    expect(called).toBe(false);
  });

  it('registers the callback when a scope IS active', () => {
    let cleaned = false;
    const scope = pushScope();
    _tryOnCleanup(() => {
      cleaned = true;
    });
    popScope();

    expect(cleaned).toBe(false);
    runCleanups(scope);
    expect(cleaned).toBe(true);
  });
});
