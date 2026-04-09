import { afterEach, beforeEach, describe, expect, test, vi } from '@vertz/test';
import { startSignalCollection, stopSignalCollection } from '../../runtime/signal';
import { query, resetDefaultQueryCache } from '../query';

/**
 * Tests for _queryGroup marker on query signals.
 *
 * In dev mode, query() marks the 5 user-facing signals (data, loading,
 * revalidating, error, idle) with _queryGroup and _hmrKey. Internal
 * signals (depHashSignal, entityBacked, refetchTrigger) are excluded.
 */
describe('query() _queryGroup marker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetDefaultQueryCache();
  });

  test('user-facing signals have _queryGroup and _hmrKey set', () => {
    startSignalCollection();
    const result = query(() => Promise.resolve({ id: '1' }), { key: 'tasks' });
    const collected = stopSignalCollection();

    // query() creates multiple signals — only the 5 user-facing ones get _queryGroup
    expect(collected.length).toBeGreaterThan(5);

    const grouped = collected.filter(
      (sig) => (sig as Record<string, unknown>)._queryGroup !== undefined,
    );
    expect(grouped.length).toBe(5);

    for (const sig of grouped) {
      expect((sig as Record<string, unknown>)._queryGroup).toBe('tasks');
    }

    // Check _hmrKey is set on each grouped signal
    const hmrKeys = grouped.map((sig) => (sig as Record<string, unknown>)._hmrKey);
    expect(hmrKeys).toContain('data');
    expect(hmrKeys).toContain('loading');
    expect(hmrKeys).toContain('revalidating');
    expect(hmrKeys).toContain('error');
    expect(hmrKeys).toContain('idle');

    result.dispose();
  });

  test('_queryGroup uses custom key when provided', () => {
    startSignalCollection();
    const result = query(() => Promise.resolve([1, 2, 3]), { key: 'my-custom-key' });
    const collected = stopSignalCollection();

    const grouped = collected.filter(
      (sig) => (sig as Record<string, unknown>)._queryGroup !== undefined,
    );
    for (const sig of grouped) {
      expect((sig as Record<string, unknown>)._queryGroup).toBe('my-custom-key');
    }

    result.dispose();
  });

  test('_queryGroup falls back to derived base key when no custom key', () => {
    startSignalCollection();
    const result = query(() => Promise.resolve('hello'));
    const collected = stopSignalCollection();

    // Without a custom key, _queryGroup should be the derived base key (not empty)
    const grouped = collected.filter(
      (sig) => (sig as Record<string, unknown>)._queryGroup !== undefined,
    );
    expect(grouped.length).toBe(5);

    for (const sig of grouped) {
      const group = (sig as Record<string, unknown>)._queryGroup;
      expect(typeof group).toBe('string');
      expect((group as string).length).toBeGreaterThan(0);
    }

    result.dispose();
  });

  test('internal signals do not have _queryGroup', () => {
    startSignalCollection();
    const result = query(() => Promise.resolve('test'), { key: 'k' });
    const collected = stopSignalCollection();

    const ungrouped = collected.filter(
      (sig) => (sig as Record<string, unknown>)._queryGroup === undefined,
    );
    // depHashSignal, entityBacked, refetchTrigger = 3 internal signals
    expect(ungrouped.length).toBeGreaterThanOrEqual(3);

    result.dispose();
  });
});
