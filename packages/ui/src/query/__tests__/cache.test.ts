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
});
