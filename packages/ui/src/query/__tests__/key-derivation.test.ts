import { describe, expect, test } from 'vitest';
import { deriveKey } from '../key-derivation';

describe('deriveKey', () => {
  test('returns a string prefixed with __q:', () => {
    const key = deriveKey(() => Promise.resolve(1));
    expect(key.startsWith('__q:')).toBe(true);
  });

  test('same function reference produces same key', () => {
    const fn = () => Promise.resolve('hello');
    expect(deriveKey(fn)).toBe(deriveKey(fn));
  });

  test('different functions with same body produce the same key', () => {
    // Two distinct function objects with identical source
    const fn1 = () => Promise.resolve('test');
    const fn2 = () => Promise.resolve('test');
    // They have the same toString(), so same derived key
    expect(deriveKey(fn1)).toBe(deriveKey(fn2));
  });

  test('functions with different bodies produce different keys', () => {
    const fn1 = () => Promise.resolve('a');
    const fn2 = () => Promise.resolve('b');
    expect(deriveKey(fn1)).not.toBe(deriveKey(fn2));
  });
});
