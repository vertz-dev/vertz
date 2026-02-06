import { describe, it, expect } from 'vitest';
import { deepFreeze } from '../freeze';

describe('deepFreeze', () => {
  it('freezes a plain object', () => {
    const obj = { name: 'John', age: 30 };
    const frozen = deepFreeze(obj);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(frozen).toBe(obj);
  });

  it('freezes nested objects recursively', () => {
    const obj = { user: { name: 'John', address: { city: 'NYC' } } };
    deepFreeze(obj);
    expect(Object.isFrozen(obj.user)).toBe(true);
    expect(Object.isFrozen(obj.user.address)).toBe(true);
  });

  it('freezes arrays and their elements', () => {
    const obj = { items: [{ id: 1 }, { id: 2 }] };
    deepFreeze(obj);
    expect(Object.isFrozen(obj.items)).toBe(true);
    expect(Object.isFrozen(obj.items[0]!)).toBe(true);
    expect(Object.isFrozen(obj.items[1]!)).toBe(true);
  });

  it('returns primitives as-is', () => {
    expect(deepFreeze('hello')).toBe('hello');
    expect(deepFreeze(42)).toBe(42);
    expect(deepFreeze(null)).toBe(null);
    expect(deepFreeze(undefined)).toBe(undefined);
    expect(deepFreeze(true)).toBe(true);
  });

  it('handles circular references without stack overflow', () => {
    const obj: any = { name: 'root' };
    obj.self = obj;
    deepFreeze(obj);
    expect(Object.isFrozen(obj)).toBe(true);
    expect(obj.self).toBe(obj);
  });
});
