import { describe, expect, test } from 'bun:test';
import { MemoryCache } from '../cache';

describe('MemoryCache', () => {
  test('get returns undefined for missing key', () => {
    const cache = new MemoryCache<string>();
    expect(cache.get('missing')).toBeUndefined();
  });

  test('set then get returns the value', () => {
    const cache = new MemoryCache<number>();
    cache.set('count', 42);
    expect(cache.get('count')).toBe(42);
  });

  test('set overwrites existing value', () => {
    const cache = new MemoryCache<string>();
    cache.set('key', 'first');
    cache.set('key', 'second');
    expect(cache.get('key')).toBe('second');
  });

  test('delete removes the entry', () => {
    const cache = new MemoryCache<string>();
    cache.set('key', 'value');
    cache.delete('key');
    expect(cache.get('key')).toBeUndefined();
  });

  test('delete on missing key is a no-op', () => {
    const cache = new MemoryCache<string>();
    // Should not throw
    cache.delete('nonexistent');
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  test('evicts least-recently-used entry when maxSize is exceeded', () => {
    const cache = new MemoryCache<string>({ maxSize: 3 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.set('d', '4'); // should evict 'a'

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
    expect(cache.get('d')).toBe('4');
  });

  test('get promotes entry to most-recently-used', () => {
    const cache = new MemoryCache<string>({ maxSize: 3 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');

    // Access 'a' — promotes it past 'b' and 'c'
    cache.get('a');

    cache.set('d', '4'); // should evict 'b' (now the oldest)

    expect(cache.get('a')).toBe('1');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe('3');
    expect(cache.get('d')).toBe('4');
  });

  test('handles falsy cached values correctly', () => {
    const cache = new MemoryCache<unknown>({ maxSize: 3 });
    cache.set('null', null);
    cache.set('zero', 0);
    cache.set('false', false);

    expect(cache.get('null')).toBeNull();
    expect(cache.get('zero')).toBe(0);
    expect(cache.get('false')).toBe(false);

    // Falsy values should also be promoted by get()
    cache.set('extra', 'x'); // should evict the oldest, not the falsy ones just accessed
    // 'null' was set first but accessed last via get() above — depends on get() order
    // null was get'd first, then zero, then false — so null is oldest after promotions
    expect(cache.get('null')).toBeUndefined(); // evicted as oldest after promotions
    expect(cache.get('zero')).toBe(0);
    expect(cache.get('false')).toBe(false);
    expect(cache.get('extra')).toBe('x');
  });

  test('overwriting existing key does not increase size', () => {
    const cache = new MemoryCache<string>({ maxSize: 3 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.set('a', 'updated'); // overwrite, not a new entry

    // No eviction should have happened
    expect(cache.get('a')).toBe('updated');
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
  });

  test('clear resets cache completely', () => {
    const cache = new MemoryCache<string>({ maxSize: 3 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.clear();

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBeUndefined();

    // After clear, new entries should work without hitting maxSize
    cache.set('d', '4');
    cache.set('e', '5');
    cache.set('f', '6');
    expect(cache.get('d')).toBe('4');
    expect(cache.get('e')).toBe('5');
    expect(cache.get('f')).toBe('6');
  });

  test('no eviction when maxSize is Infinity', () => {
    const cache = new MemoryCache<string>({ maxSize: Infinity });
    for (let i = 0; i < 500; i++) {
      cache.set(`key-${i}`, `val-${i}`);
    }
    // All entries should be retained
    expect(cache.get('key-0')).toBe('val-0');
    expect(cache.get('key-499')).toBe('val-499');
  });

  test('default maxSize allows at least 1000 entries', () => {
    const cache = new MemoryCache<string>();
    for (let i = 0; i < 1000; i++) {
      cache.set(`key-${i}`, `val-${i}`);
    }
    expect(cache.get('key-0')).toBe('val-0');
    expect(cache.get('key-999')).toBe('val-999');
  });
});
