import { FetchNetworkError, ok } from '@vertz/errors';
import { describe, expect, it, vi } from 'vitest';
import { createDescriptor, isQueryDescriptor } from './descriptor';
import type { FetchResponse } from './types';

describe('createDescriptor', () => {
  it('produces correct key from method + path', () => {
    const fetchFn = vi.fn() as unknown as () => Promise<FetchResponse<string>>;
    const descriptor = createDescriptor('GET', '/tasks', fetchFn);

    expect(descriptor._key).toBe('GET:/tasks');
  });

  it('produces sorted deterministic key with query params', () => {
    const fetchFn = vi.fn() as unknown as () => Promise<FetchResponse<string>>;
    const descriptor = createDescriptor('GET', '/tasks', fetchFn, {
      status: 'active',
      page: 1,
    });

    expect(descriptor._key).toBe('GET:/tasks?page=1&status=active');
  });

  it('excludes null and undefined query values from key', () => {
    const fetchFn = vi.fn() as unknown as () => Promise<FetchResponse<string>>;
    const descriptor = createDescriptor('GET', '/tasks', fetchFn, {
      page: 1,
      filter: undefined,
      sort: null,
    });

    expect(descriptor._key).toBe('GET:/tasks?page=1');
  });

  it('produces key without query string when query is empty after filtering', () => {
    const fetchFn = vi.fn() as unknown as () => Promise<FetchResponse<string>>;
    const descriptor = createDescriptor('GET', '/tasks', fetchFn, {
      filter: undefined,
    });

    expect(descriptor._key).toBe('GET:/tasks');
  });

  it('await descriptor resolves to unwrapped T', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        ok({ data: { id: 1, title: 'Test' }, status: 200, headers: new Headers() }),
      );
    const descriptor = createDescriptor('GET', '/tasks/1', fetchFn);

    const result = await descriptor;

    expect(result).toEqual({ id: 1, title: 'Test' });
  });

  it('await descriptor throws FetchError on error result', async () => {
    const error = new FetchNetworkError('Network failure');
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, error });
    const descriptor = createDescriptor('GET', '/tasks/1', fetchFn);

    await expect(descriptor).rejects.toBe(error);
  });

  it('Promise.all works with multiple descriptors', async () => {
    const fetchFn1 = vi
      .fn()
      .mockResolvedValue(ok({ data: 'result-1', status: 200, headers: new Headers() }));
    const fetchFn2 = vi
      .fn()
      .mockResolvedValue(ok({ data: 'result-2', status: 200, headers: new Headers() }));

    const d1 = createDescriptor('GET', '/a', fetchFn1);
    const d2 = createDescriptor('GET', '/b', fetchFn2);

    const results = await Promise.all([d1, d2]);
    expect(results).toEqual(['result-1', 'result-2']);
  });

  it('204 DELETE resolves to undefined', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(ok({ data: undefined, status: 204, headers: new Headers() }));
    const descriptor = createDescriptor<void>('DELETE', '/tasks/1', fetchFn);

    const result = await descriptor;
    expect(result).toBeUndefined();
  });
});

describe('isQueryDescriptor', () => {
  it('returns true for descriptors', () => {
    const fetchFn = vi.fn() as unknown as () => Promise<FetchResponse<string>>;
    const descriptor = createDescriptor('GET', '/tasks', fetchFn);

    expect(isQueryDescriptor(descriptor)).toBe(true);
  });

  it('returns false for plain functions', () => {
    expect(isQueryDescriptor(() => {})).toBe(false);
  });

  it('returns false for plain objects', () => {
    expect(isQueryDescriptor({ _key: 'test', _fetch: () => {} })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isQueryDescriptor(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isQueryDescriptor(undefined)).toBe(false);
  });
});
