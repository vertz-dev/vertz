import { describe, expect, test } from 'bun:test';
import { ref } from '../refs';

describe('ref', () => {
  test('returns an object with current initially undefined', () => {
    const r = ref<HTMLElement>();
    expect(r.current).toBeUndefined();
  });

  test('current can be assigned a value', () => {
    const r = ref<HTMLDivElement>();
    const el = document.createElement('div');
    r.current = el;
    expect(r.current).toBe(el);
  });

  test('current can be reassigned', () => {
    const r = ref<HTMLDivElement>();
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');
    r.current = el1;
    expect(r.current).toBe(el1);
    r.current = el2;
    expect(r.current).toBe(el2);
  });

  test('works with generic types', () => {
    const numRef = ref<number>();
    expect(numRef.current).toBeUndefined();
    numRef.current = 42;
    expect(numRef.current).toBe(42);
  });
});
