import { describe, it, expect } from 'vitest';
import { signal } from '@vertz/ui';
import { pushScope, popScope, runCleanups } from '@vertz/ui/internals';
import { bindProp, bindPropCustom } from '../bind-signal';

describe('bindProp', () => {
  it('sets a static value directly on the target', () => {
    const t = { x: 0 };
    bindProp(t, 'x', 42);
    expect(t.x).toBe(42);
  });

  it('does nothing when value is undefined', () => {
    const t = { x: 99 };
    bindProp(t, 'x', undefined);
    expect(t.x).toBe(99);
  });

  it('creates a reactive binding for a signal getter', () => {
    const scope = pushScope();
    const x = signal(10);
    const t = { x: 0 };

    bindProp(t, 'x', () => x.value);
    expect(t.x).toBe(10);

    x.value = 25;
    expect(t.x).toBe(25);

    x.value = -3;
    expect(t.x).toBe(-3);

    runCleanups(scope);
    popScope();
  });

  it('dispose stops the reactive binding', () => {
    const scope = pushScope();
    const x = signal(10);
    const t = { x: 0 };

    const dispose = bindProp(t, 'x', () => x.value);
    expect(t.x).toBe(10);

    dispose?.();
    x.value = 999;
    expect(t.x).toBe(10); // unchanged after dispose

    runCleanups(scope);
    popScope();
  });

  it('returns undefined for static values', () => {
    expect(bindProp({ x: 0 }, 'x', 42)).toBeUndefined();
  });
});

describe('bindPropCustom', () => {
  it('calls apply with a static value', () => {
    let v = 0;
    bindPropCustom(5, (x) => { v = x; });
    expect(v).toBe(5);
  });

  it('does nothing when undefined', () => {
    let called = false;
    bindPropCustom(undefined, () => { called = true; });
    expect(called).toBe(false);
  });

  it('creates a reactive binding through apply', () => {
    const scope = pushScope();
    const s = signal(1);
    let v = 0;

    bindPropCustom(() => s.value, (x) => { v = x; });
    expect(v).toBe(1);

    s.value = 7;
    expect(v).toBe(7);

    runCleanups(scope);
    popScope();
  });
});
