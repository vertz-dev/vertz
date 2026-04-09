import { describe, expect, test } from '@vertz/test';
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

  test('maxSize: 0 immediately evicts every entry', () => {
    const cache = new MemoryCache<string>({ maxSize: 0 });
    cache.set('a', '1');
    expect(cache.get('a')).toBeUndefined();
  });

  test('maxSize: 1 keeps only the most recent entry', () => {
    const cache = new MemoryCache<string>({ maxSize: 1 });
    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
  });

  test('negative maxSize is clamped to 0 (no infinite loop)', () => {
    const cache = new MemoryCache<string>({ maxSize: -5 });
    cache.set('a', '1');
    expect(cache.get('a')).toBeUndefined();
  });

  test('NaN maxSize falls back to default (no unbounded growth)', () => {
    const cache = new MemoryCache<string>({ maxSize: NaN });
    for (let i = 0; i < 1002; i++) {
      cache.set(`key-${i}`, `val-${i}`);
    }
    expect(cache.get('key-0')).toBeUndefined();
    expect(cache.get('key-1')).toBeUndefined();
    expect(cache.get('key-1001')).toBe('val-1001');
  });

  test('empty-string key is evictable and retrievable', () => {
    const cache = new MemoryCache<string>({ maxSize: 2 });
    cache.set('', 'empty-key-value');
    cache.set('b', '2');
    cache.set('c', '3'); // evicts ''
    expect(cache.get('')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
  });

  test('default maxSize evicts at 1001st entry', () => {
    const cache = new MemoryCache<string>();
    for (let i = 0; i < 1001; i++) {
      cache.set(`key-${i}`, `val-${i}`);
    }
    expect(cache.get('key-0')).toBeUndefined();
    expect(cache.get('key-1000')).toBe('val-1000');
  });
});

describe('MemoryCache orphan-aware eviction', () => {
  test('evicts unclaimed entries before retained entries', () => {
    const cache = new MemoryCache<string>({ maxSize: 3 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');

    // Retain 'a' — it's actively used by a query
    cache.retain('a');

    // Insert 'd' — should evict 'b' (oldest unclaimed), NOT 'a' (retained)
    cache.set('d', '4');

    expect(cache.get('a')).toBe('1'); // retained — protected
    expect(cache.get('b')).toBeUndefined(); // unclaimed — evicted
    expect(cache.get('c')).toBe('3');
    expect(cache.get('d')).toBe('4');
  });

  test('evicts orphaned entries before unclaimed entries', () => {
    const cache = new MemoryCache<string>({ maxSize: 3 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');

    // Retain then release 'c' — it becomes orphaned
    cache.retain('c');
    cache.release('c');

    // Insert 'd' — should evict 'c' (orphaned) before 'a' or 'b' (unclaimed)
    cache.set('d', '4');

    expect(cache.get('a')).toBe('1');
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBeUndefined(); // orphaned — evicted first
    expect(cache.get('d')).toBe('4');
  });

  test('longest-orphaned evicted first among multiple orphans', () => {
    const cache = new MemoryCache<string>({ maxSize: 4 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.set('d', '4');

    // Retain all, then release in order: b first, then d
    cache.retain('a');
    cache.retain('b');
    cache.retain('c');
    cache.retain('d');

    cache.release('b'); // orphaned first
    cache.release('d'); // orphaned second

    // Insert 'e' — should evict 'b' (longest-orphaned)
    cache.set('e', '5');

    expect(cache.get('a')).toBe('1'); // retained
    expect(cache.get('b')).toBeUndefined(); // orphaned first — evicted
    expect(cache.get('c')).toBe('3'); // retained
    expect(cache.get('d')).toBe('4'); // orphaned second — not yet evicted
    expect(cache.get('e')).toBe('5');
  });

  test('multiple queries retaining the same key — only orphaned when all release', () => {
    const cache = new MemoryCache<string>({ maxSize: 2 });
    cache.set('a', '1');
    cache.set('b', '2');

    // Two queries retain 'a'
    cache.retain('a');
    cache.retain('a');

    // First query releases — ref count drops to 1, NOT orphaned
    cache.release('a');

    cache.set('c', '3'); // should evict 'b' (unclaimed)

    expect(cache.get('a')).toBe('1'); // still retained (ref count 1)
    expect(cache.get('b')).toBeUndefined(); // unclaimed — evicted

    // Second query releases — ref count drops to 0, now orphaned
    cache.release('a');

    cache.set('d', '4'); // should evict 'a' (orphaned)

    // 'c' was promoted by get() above, 'a' is orphaned
    expect(cache.get('a')).toBeUndefined(); // orphaned — evicted
    expect(cache.get('d')).toBe('4');
  });

  test('release on non-retained key is a no-op', () => {
    const cache = new MemoryCache<string>({ maxSize: 3 });
    cache.set('a', '1');

    // Should not throw or break eviction
    cache.release('a');
    cache.release('nonexistent');

    expect(cache.get('a')).toBe('1');
  });

  test('retain on non-existent key does not break eviction', () => {
    const cache = new MemoryCache<string>({ maxSize: 2 });

    // Retain a key that doesn't exist in the store
    cache.retain('phantom');

    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3'); // should evict 'a' (unclaimed, oldest)

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
  });

  test('delete cleans up retain/orphan tracking', () => {
    const cache = new MemoryCache<string>({ maxSize: 2 });
    cache.set('a', '1');
    cache.set('b', '2');

    cache.retain('a');
    cache.delete('a');

    // 'a' is gone — release should be a no-op, not crash
    cache.release('a');

    // After delete('a'), store has {b}, size 1. Fill to trigger eviction.
    cache.set('c', '3'); // size 2, no eviction
    cache.set('d', '4'); // size 3 > maxSize 2, evicts 'b' (oldest unclaimed)
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe('3');
    expect(cache.get('d')).toBe('4');
  });

  test('clear resets retain/orphan tracking', () => {
    const cache = new MemoryCache<string>({ maxSize: 3 });
    cache.set('a', '1');
    cache.retain('a');
    cache.clear();

    // After clear, 'a' should not be tracked as retained
    cache.set('b', '2');
    cache.set('c', '3');
    cache.set('d', '4');
    cache.set('e', '5'); // should evict 'b' (oldest, no retained entries)

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe('3');
  });

  test('all entries retained — evicts oldest retained as last resort', () => {
    const cache = new MemoryCache<string>({ maxSize: 2 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.retain('a');
    cache.retain('b');

    cache.set('c', '3'); // no orphans, no unclaimed — evicts 'a' (oldest retained)

    expect(cache.get('a')).toBeUndefined(); // evicted as last resort
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
  });

  test('re-retain after release transitions orphan back to active', () => {
    const cache = new MemoryCache<string>({ maxSize: 3 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');

    // Retain then release 'a' — it becomes orphaned
    cache.retain('a');
    cache.release('a');

    // Re-retain 'a' — it should no longer be orphaned
    cache.retain('a');

    // Insert 'd' — should evict 'b' (unclaimed), NOT 'a' (re-retained)
    cache.set('d', '4');

    expect(cache.get('a')).toBe('1'); // re-retained — protected
    expect(cache.get('b')).toBeUndefined(); // unclaimed — evicted
    expect(cache.get('c')).toBe('3');
    expect(cache.get('d')).toBe('4');
  });

  test('without retain/release, eviction behaves as pure LRU', () => {
    const cache = new MemoryCache<string>({ maxSize: 3 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.get('a'); // promote 'a'
    cache.set('d', '4'); // should evict 'b' (LRU)

    expect(cache.get('a')).toBe('1');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe('3');
    expect(cache.get('d')).toBe('4');
  });
});
