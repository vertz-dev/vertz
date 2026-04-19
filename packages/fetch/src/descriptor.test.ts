import { describe, expect, it, mock } from '@vertz/test';
import { FetchNetworkError, ok } from '@vertz/errors';
import {
  createDescriptor,
  createMutationDescriptor,
  createStreamDescriptor,
  isMutationDescriptor,
  isQueryDescriptor,
  isStreamDescriptor,
  serializeQueryParams,
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

  it('calls rollback and re-throws when fetch rejects without onRejected', async () => {
    const fetchError = new Error('Connection refused');
    const rollbackCalled = mock();
    const fetchFn = mock().mockRejectedValue(fetchError);
    const handler: OptimisticHandler = {
      apply() {
        return rollbackCalled;
      },
      commit: mock(),
    };

    const descriptor = createMutationDescriptor(
      'POST',
      '/todos',
      fetchFn,
      { entityType: 'todos', kind: 'create', body: { title: 'Test' } },
      handler,
    );

    let caught: unknown;
    try {
      await descriptor;
    } catch (err) {
      caught = err;
    }

    expect(caught).toBe(fetchError);
    expect(rollbackCalled).toHaveBeenCalledTimes(1);
    expect(handler.commit).not.toHaveBeenCalled();
  });

  it('calls rollback and delegates to onRejected when fetch rejects with handler', async () => {
    const fetchError = new Error('Connection refused');
    const rollbackCalled = mock();
    const fetchFn = mock().mockRejectedValue(fetchError);
    const handler: OptimisticHandler = {
      apply() {
        return rollbackCalled;
      },
      commit: mock(),
    };

    const descriptor = createMutationDescriptor(
      'POST',
      '/todos',
      fetchFn,
      { entityType: 'todos', kind: 'create', body: { title: 'Test' } },
      handler,
    );

    const result = await descriptor.then(
      (r) => r,
      (err) => ({ ok: false as const, caught: (err as Error).message }),
    );

    expect(result).toEqual({ ok: false, caught: 'Connection refused' });
    expect(rollbackCalled).toHaveBeenCalledTimes(1);
    expect(handler.commit).not.toHaveBeenCalled();
  });

  it('re-throws when fetch rejects and .then() called without onRejected', async () => {
    const fetchError = new Error('Connection refused');
    const rollbackCalled = mock();
    const fetchFn = mock().mockRejectedValue(fetchError);
    const handler: OptimisticHandler = {
      apply() {
        return rollbackCalled;
      },
      commit: mock(),
    };

    const descriptor = createMutationDescriptor(
      'POST',
      '/todos',
      fetchFn,
      { entityType: 'todos', kind: 'create', body: { title: 'Test' } },
      handler,
    );

    let caught: unknown;
    try {
      await descriptor.then((r) => r);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBe(fetchError);
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

describe('serializeQueryParams', () => {
  it('returns empty string for undefined', () => {
    expect(serializeQueryParams(undefined)).toBe('');
  });

  it('returns empty string when all values are null/undefined', () => {
    expect(serializeQueryParams({ a: null, b: undefined })).toBe('');
  });

  it('alphabetizes keys for deterministic output', () => {
    expect(serializeQueryParams({ z: 1, a: 2, m: 3 })).toBe('?a=2&m=3&z=1');
  });

  it('URL-encodes values', () => {
    expect(serializeQueryParams({ q: 'hello world' })).toBe('?q=hello+world');
  });
});

describe('createStreamDescriptor', () => {
  it('produces correct key from method + path', () => {
    const desc = createStreamDescriptor('GET', '/events', async function* () {});
    expect(desc._key).toBe('GET:/events');
  });

  it('derives key with sorted query params (parity with createDescriptor)', () => {
    const desc = createStreamDescriptor('GET', '/events', async function* () {}, {
      topic: 'deploys',
      since: '123',
    });
    expect(desc._key).toBe('GET:/events?since=123&topic=deploys');
  });

  it('cache key matches createDescriptor for the same method/path/args', () => {
    const fetchFn = mock() as unknown as () => Promise<FetchResponse<string>>;
    const queryDesc = createDescriptor('GET', '/events', fetchFn, { topic: 'deploys' });
    const streamDesc = createStreamDescriptor('GET', '/events', async function* () {}, {
      topic: 'deploys',
    });
    expect(streamDesc._key).toBe(queryDesc._key);
  });

  it('sets _tag to StreamDescriptor', () => {
    const desc = createStreamDescriptor('GET', '/events', async function* () {});
    expect(desc._tag).toBe('StreamDescriptor');
  });

  it('exposes _stream as a callable factory that yields the iterable', async () => {
    const desc = createStreamDescriptor('GET', '/events', async function* () {
      yield { id: '1' };
      yield { id: '2' };
    });
    const items: unknown[] = [];
    for await (const item of desc._stream(new AbortController().signal)) {
      items.push(item);
    }
    expect(items).toEqual([{ id: '1' }, { id: '2' }]);
  });

  it('passes the signal through to the factory so abort propagates', async () => {
    let receivedSignal: AbortSignal | undefined;
    const desc = createStreamDescriptor('GET', '/events', (signal) => {
      receivedSignal = signal;
      return (async function* () {
        yield 1;
      })();
    });
    const controller = new AbortController();
    for await (const _ of desc._stream(controller.signal)) {
      // drain
    }
    expect(receivedSignal).toBe(controller.signal);
  });
});

describe('isStreamDescriptor', () => {
  it('returns true for StreamDescriptor', () => {
    const desc = createStreamDescriptor('GET', '/events', async function* () {});
    expect(isStreamDescriptor(desc)).toBe(true);
  });

  it('returns false for QueryDescriptor', () => {
    const fetchFn = mock() as unknown as () => Promise<FetchResponse<string>>;
    const desc = createDescriptor('GET', '/tasks', fetchFn);
    expect(isStreamDescriptor(desc)).toBe(false);
  });

  it('returns false for null and plain objects', () => {
    expect(isStreamDescriptor(null)).toBe(false);
    expect(isStreamDescriptor({})).toBe(false);
    expect(isStreamDescriptor({ _tag: 'QueryDescriptor' })).toBe(false);
  });

  it('returns false for malformed object (correct tag, missing _stream function)', () => {
    expect(isStreamDescriptor({ _tag: 'StreamDescriptor' })).toBe(false);
    expect(isStreamDescriptor({ _tag: 'StreamDescriptor', _stream: 'not-a-fn' })).toBe(false);
  });
});
