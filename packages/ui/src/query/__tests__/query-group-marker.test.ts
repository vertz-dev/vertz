import { afterEach, beforeEach, describe, expect, test, vi } from 'bun:test';
import { startSignalCollection, stopSignalCollection } from '../../runtime/signal';
import { query, resetDefaultQueryCache } from '../query';

/**
 * Tests for _queryGroup marker on query signals.
 *
 * In dev mode, query() should mark each signal it creates with a
 * _queryGroup property equal to the query's cache key. This allows
 * the state inspector to group query signals together.
 */
describe('query() _queryGroup marker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetDefaultQueryCache();
  });

  test('signals created by query() have _queryGroup set', () => {
    startSignalCollection();
    const result = query(() => Promise.resolve({ id: '1' }), { key: 'tasks' });
    const collected = stopSignalCollection();

    // query() creates multiple signals internally — all should have _queryGroup
    expect(collected.length).toBeGreaterThan(0);

    for (const sig of collected) {
      expect((sig as Record<string, unknown>)._queryGroup).toBe('tasks');
    }

    result.dispose();
  });

  test('_queryGroup uses custom key when provided', () => {
    startSignalCollection();
    const result = query(() => Promise.resolve([1, 2, 3]), { key: 'my-custom-key' });
    const collected = stopSignalCollection();

    for (const sig of collected) {
      expect((sig as Record<string, unknown>)._queryGroup).toBe('my-custom-key');
    }

    result.dispose();
  });

  test('_queryGroup falls back to derived base key when no custom key', () => {
    startSignalCollection();
    const result = query(() => Promise.resolve('hello'));
    const collected = stopSignalCollection();

    // Without a custom key, _queryGroup should be the derived base key (not empty)
    for (const sig of collected) {
      const group = (sig as Record<string, unknown>)._queryGroup;
      expect(group).toBeDefined();
      expect(typeof group).toBe('string');
      expect((group as string).length).toBeGreaterThan(0);
    }

    result.dispose();
  });
});
