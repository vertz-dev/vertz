import { describe, expect, test } from 'bun:test';
import { signal } from '../../runtime/signal';
import type { QueryResult } from '../query';
import { queryMatch } from '../query-match';

/**
 * Helper: create a fake QueryResult with signal-backed properties.
 * At runtime, QueryResult properties are Signal objects with .value,
 * even though the TypeScript type erases .value via Unwrapped<>.
 */
function fakeQueryResult<T>(opts: { loading: boolean; error?: unknown; data?: T }): QueryResult<T> {
  return {
    loading: signal(opts.loading),
    error: signal(opts.error),
    data: signal(opts.data),
    refetch: () => {},
    revalidate: () => {},
    dispose: () => {},
  } as unknown as QueryResult<T>;
}

describe('queryMatch()', () => {
  test('returns loading handler result when loading is true', () => {
    const qr = fakeQueryResult<string>({ loading: true });

    const result = queryMatch(qr, {
      loading: () => 'loading-state',
      error: () => 'error-state',
      data: () => 'data-state',
    });

    expect(result).toBe('loading-state');
  });

  test('returns error handler result when error is defined and loading is false', () => {
    const qr = fakeQueryResult<string>({
      loading: false,
      error: new Error('fail'),
    });

    const result = queryMatch(qr, {
      loading: () => 'loading-state',
      error: () => 'error-state',
      data: () => 'data-state',
    });

    expect(result).toBe('error-state');
  });

  test('returns data handler result when data is available', () => {
    const qr = fakeQueryResult<string>({
      loading: false,
      data: 'hello',
    });

    const result = queryMatch(qr, {
      loading: () => 'loading-state',
      error: () => 'error-state',
      data: () => 'data-state',
    });

    expect(result).toBe('data-state');
  });

  test('passes error value to error handler', () => {
    const err = new Error('something broke');
    const qr = fakeQueryResult<string>({
      loading: false,
      error: err,
    });

    const result = queryMatch(qr, {
      loading: () => null,
      error: (e) => e,
      data: () => null,
    });

    expect(result).toBe(err);
  });

  test('passes data value to data handler', () => {
    const qr = fakeQueryResult<{ name: string }>({
      loading: false,
      data: { name: 'Alice' },
    });

    const result = queryMatch(qr, {
      loading: () => null,
      error: () => null,
      data: (d) => d.name,
    });

    expect(result).toBe('Alice');
  });

  test('loading takes priority over error', () => {
    const qr = fakeQueryResult<string>({
      loading: true,
      error: new Error('fail'),
    });

    const result = queryMatch(qr, {
      loading: () => 'loading-state',
      error: () => 'error-state',
      data: () => 'data-state',
    });

    expect(result).toBe('loading-state');
  });

  test('loading takes priority over data', () => {
    const qr = fakeQueryResult<string>({
      loading: true,
      data: 'hello',
    });

    const result = queryMatch(qr, {
      loading: () => 'loading-state',
      error: () => 'error-state',
      data: () => 'data-state',
    });

    expect(result).toBe('loading-state');
  });
});
