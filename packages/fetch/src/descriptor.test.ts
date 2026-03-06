import { describe, expect, it, mock } from 'bun:test';
import { FetchNetworkError, ok } from '@vertz/errors';
import {
  createDescriptor,
  createMutationDescriptor,
  isMutationDescriptor,
  isQueryDescriptor,
} from './descriptor';
import type { FetchResponse, OptimisticHandler } from './types';

describe('createDescriptor', () => {
  it('produces correct key from method + path', () => {
    const fetchFn = mock() as unknown as () => Promise<FetchResponse<string>>;
    const descriptor = createDescriptor('GET', '/tasks', fetchFn);

    expect(descriptor._key).toBe('GET:/tasks');
  });

  it('produces sorted deterministic key with query params', () => {
    const fetchFn = mock() as unknown as () => Promise<FetchResponse<string>>;
    const descriptor = createDescriptor('GET', '/tasks', fetchFn, {
      status: 'active',
      page: 1,
    });

    expect(descriptor._key).toBe('GET:/tasks?page=1&status=active');
  });

  it('excludes null and undefined query values from key', () => {
    const fetchFn = mock() as unknown as () => Promise<FetchResponse<string>>;
    const descriptor = createDescriptor('GET', '/tasks', fetchFn, {
      page: 1,
      filter: undefined,
      sort: null,
    });

    expect(descriptor._key).toBe('GET:/tasks?page=1');
  });

  it('produces key without query string when query is empty after filtering', () => {
    const fetchFn = mock() as unknown as () => Promise<FetchResponse<string>>;
    const descriptor = createDescriptor('GET', '/tasks', fetchFn, {
      filter: undefined,
    });

    expect(descriptor._key).toBe('GET:/tasks');
  });

  it('await descriptor resolves to Ok<T> on success', async () => {
    const fetchFn = mock().mockResolvedValue(
      ok({ data: { id: 1, title: 'Test' }, status: 200, headers: new Headers() }),
    );
    const descriptor = createDescriptor('GET', '/tasks/1', fetchFn);

    const result = await descriptor;

    expect(result).toEqual({ ok: true, data: { id: 1, title: 'Test' } });
  });

  it('await descriptor resolves to Err<FetchError> on error result', async () => {
    const error = new FetchNetworkError('Network failure');
    const fetchFn = mock().mockResolvedValue({ ok: false, error });
    const descriptor = createDescriptor('GET', '/tasks/1', fetchFn);

    const result = await descriptor;

    expect(result).toEqual({ ok: false, error });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(error);
    }
  });

  it('Promise.all works with multiple descriptors', async () => {
    const fetchFn1 = mock().mockResolvedValue(
      ok({ data: 'result-1', status: 200, headers: new Headers() }),
    );
    const fetchFn2 = mock().mockResolvedValue(
      ok({ data: 'result-2', status: 200, headers: new Headers() }),
    );

    const d1 = createDescriptor('GET', '/a', fetchFn1);
    const d2 = createDescriptor('GET', '/b', fetchFn2);

    const results = await Promise.all([d1, d2]);
    expect(results).toEqual([
      { ok: true, data: 'result-1' },
      { ok: true, data: 'result-2' },
    ]);
  });

  it('includes entity metadata when provided', () => {
    const fetchFn = mock() as unknown as () => Promise<FetchResponse<string>>;
    const descriptor = createDescriptor('GET', '/todos/1', fetchFn, undefined, {
      entityType: 'todos',
      kind: 'get',
      id: '1',
    });

    expect(descriptor._entity).toEqual({ entityType: 'todos', kind: 'get', id: '1' });
  });

  it('omits entity metadata when not provided', () => {
    const fetchFn = mock() as unknown as () => Promise<FetchResponse<string>>;
    const descriptor = createDescriptor('GET', '/tasks', fetchFn);

    expect(descriptor._entity).toBeUndefined();
  });

  it('204 DELETE resolves to Ok<undefined>', async () => {
    const fetchFn = mock().mockResolvedValue(
      ok({ data: undefined, status: 204, headers: new Headers() }),
    );
    const descriptor = createDescriptor<void>('DELETE', '/tasks/1', fetchFn);

    const result = await descriptor;
    expect(result).toEqual({ ok: true, data: undefined });
  });
});

describe('isQueryDescriptor', () => {
  it('returns true for descriptors', () => {
    const fetchFn = mock() as unknown as () => Promise<FetchResponse<string>>;
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

describe('createMutationDescriptor', () => {
  it('creates a MutationDescriptor with correct tag and key', () => {
    const fetchFn = mock().mockResolvedValue(
      ok({ data: { id: '1' }, status: 200, headers: new Headers() }),
    );
    const descriptor = createMutationDescriptor('PATCH', '/todos/1', fetchFn, {
      entityType: 'todos',
      kind: 'update',
      id: '1',
      body: { completed: true },
    });

    expect(descriptor._tag).toBe('MutationDescriptor');
    expect(descriptor._key).toBe('PATCH:/todos/1');
    expect(descriptor._mutation.entityType).toBe('todos');
    expect(descriptor._mutation.kind).toBe('update');
  });

  it('await resolves to Ok<T> on success', async () => {
    const fetchFn = mock().mockResolvedValue(
      ok({ data: { id: '1', completed: true }, status: 200, headers: new Headers() }),
    );
    const descriptor = createMutationDescriptor('PATCH', '/todos/1', fetchFn, {
      entityType: 'todos',
      kind: 'update',
      id: '1',
      body: { completed: true },
    });

    const result = await descriptor;

    expect(result).toEqual({ ok: true, data: { id: '1', completed: true } });
  });

  it('calls handler.apply before fetch and handler.commit on success', async () => {
    const callOrder: string[] = [];
    const fetchFn = mock(() => {
      callOrder.push('fetch');
      return Promise.resolve(
        ok({ data: { id: '1', completed: true }, status: 200, headers: new Headers() }),
      );
    });
    const handler: OptimisticHandler = {
      apply(_meta, _mutationId) {
        callOrder.push('apply');
        return () => {
          callOrder.push('rollback');
        };
      },
      commit(_meta, _mutationId, _data) {
        callOrder.push('commit');
      },
    };

    const descriptor = createMutationDescriptor(
      'PATCH',
      '/todos/1',
      fetchFn,
      { entityType: 'todos', kind: 'update', id: '1', body: { completed: true } },
      handler,
    );

    await descriptor;

    expect(callOrder).toEqual(['apply', 'fetch', 'commit']);
  });

  it('calls rollback on fetch error result', async () => {
    const error = new FetchNetworkError('Network failure');
    const rollbackCalled = mock();
    const fetchFn = mock().mockResolvedValue({ ok: false, error });
    const handler: OptimisticHandler = {
      apply() {
        return rollbackCalled;
      },
      commit: mock(),
    };

    const descriptor = createMutationDescriptor(
      'DELETE',
      '/todos/1',
      fetchFn,
      { entityType: 'todos', kind: 'delete', id: '1' },
      handler,
    );

    const result = await descriptor;

    expect(result.ok).toBe(false);
    expect(rollbackCalled).toHaveBeenCalledTimes(1);
    expect(handler.commit).not.toHaveBeenCalled();
  });
});

describe('isMutationDescriptor', () => {
  it('returns true for MutationDescriptor', () => {
    const fetchFn = mock().mockResolvedValue(
      ok({ data: { id: '1' }, status: 200, headers: new Headers() }),
    );
    const descriptor = createMutationDescriptor('PATCH', '/todos/1', fetchFn, {
      entityType: 'todos',
      kind: 'update',
      id: '1',
    });

    expect(isMutationDescriptor(descriptor)).toBe(true);
  });

  it('returns false for QueryDescriptor', () => {
    const fetchFn = mock() as unknown as () => Promise<FetchResponse<string>>;
    const descriptor = createDescriptor('GET', '/tasks', fetchFn);

    expect(isMutationDescriptor(descriptor)).toBe(false);
  });

  it('returns false for null and plain objects', () => {
    expect(isMutationDescriptor(null)).toBe(false);
    expect(isMutationDescriptor({ _tag: 'QueryDescriptor' })).toBe(false);
  });
});
