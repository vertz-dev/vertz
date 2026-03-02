import { describe, expect, test } from 'bun:test';
import { signal } from '../../runtime/signal';
import type { Signal } from '../../runtime/signal-types';
import type { QueryResult } from '../query';
import { queryMatch } from '../query-match';

/**
 * Helper: create a fake QueryResult with signal-backed properties.
 * At runtime, QueryResult properties are Signal objects with .value,
 * even though the TypeScript type erases .value via Unwrapped<>.
 */
function fakeQueryResult<T>(opts: {
  loading: boolean;
  revalidating?: boolean;
  error?: unknown;
  data?: T;
}): QueryResult<T> & {
  _loading: Signal<boolean>;
  _revalidating: Signal<boolean>;
  _error: Signal<unknown>;
  _data: Signal<T | undefined>;
} {
  const _loading = signal(opts.loading);
  const _revalidating = signal(opts.revalidating ?? false);
  const _error = signal<unknown>(opts.error);
  const _data = signal<T | undefined>(opts.data);
  return {
    loading: _loading,
    revalidating: _revalidating,
    error: _error,
    data: _data,
    refetch: () => {},
    revalidate: () => {},
    dispose: () => {},
    _loading,
    _revalidating,
    _error,
    _data,
  } as unknown as QueryResult<T> & {
    _loading: Signal<boolean>;
    _revalidating: Signal<boolean>;
    _error: Signal<unknown>;
    _data: Signal<T | undefined>;
  };
}

describe('queryMatch()', () => {
  test('returns an HTMLElement wrapper with display:contents', () => {
    const qr = fakeQueryResult<string>({ loading: true });

    const result = queryMatch(qr, {
      loading: () => document.createElement('div'),
      error: () => document.createElement('div'),
      data: () => document.createElement('div'),
    });

    expect(result instanceof HTMLElement).toBe(true);
    expect(result.style.display).toBe('contents');
  });

  test('returns the same node for repeated calls with same queryResult', () => {
    const qr = fakeQueryResult<string>({ loading: true });

    const handlers = {
      loading: () => document.createElement('div'),
      error: () => document.createElement('div'),
      data: () => document.createElement('div'),
    };

    const first = queryMatch(qr, handlers);
    const second = queryMatch(qr, handlers);

    expect(first).toBe(second);
  });

  test('renders loading handler content when loading is true', () => {
    const qr = fakeQueryResult<string>({ loading: true });

    const loadingEl = document.createElement('div');
    loadingEl.textContent = 'Loading...';

    const wrapper = queryMatch(qr, {
      loading: () => loadingEl,
      error: () => document.createElement('div'),
      data: () => document.createElement('div'),
    });

    expect(wrapper.children.length).toBe(1);
    expect(wrapper.children[0]).toBe(loadingEl);
  });

  test('renders error handler content when error is set', () => {
    const qr = fakeQueryResult<string>({ loading: false, error: new Error('fail') });

    const errorEl = document.createElement('div');
    errorEl.textContent = 'Error!';

    const wrapper = queryMatch(qr, {
      loading: () => document.createElement('div'),
      error: () => errorEl,
      data: () => document.createElement('div'),
    });

    expect(wrapper.children[0]).toBe(errorEl);
  });

  test('renders data handler content when data is available', () => {
    const qr = fakeQueryResult<string>({ loading: false, data: 'hello' });

    const dataEl = document.createElement('div');
    dataEl.textContent = 'Data';

    const wrapper = queryMatch(qr, {
      loading: () => document.createElement('div'),
      error: () => document.createElement('div'),
      data: () => dataEl,
    });

    expect(wrapper.children[0]).toBe(dataEl);
  });

  test('switches branch when state changes from loading to data', () => {
    const qr = fakeQueryResult<string>({ loading: true });

    const loadingEl = document.createElement('div');
    loadingEl.textContent = 'Loading...';
    const dataEl = document.createElement('div');
    dataEl.textContent = 'Data';

    const wrapper = queryMatch(qr, {
      loading: () => loadingEl,
      error: () => document.createElement('div'),
      data: () => dataEl,
    });

    // Initially loading
    expect(wrapper.children[0]).toBe(loadingEl);

    // Transition: loading=false, data available
    qr._data.value = 'hello';
    qr._loading.value = false;

    // Should now show data branch
    expect(wrapper.children.length).toBe(1);
    expect(wrapper.children[0]).toBe(dataEl);

    wrapper.dispose();
  });

  test('proxy binds array methods to current data', () => {
    const qr = fakeQueryResult<{ items: string[] }>({
      loading: false,
      data: { items: ['a', 'b', 'c'] },
    });

    let mappedResult: string[] | undefined;

    const wrapper = queryMatch(qr, {
      loading: () => null,
      error: () => null,
      data: (response) => {
        // .map() should work on the proxied array
        mappedResult = response.items.map((item: string) => item.toUpperCase());
        return document.createElement('div');
      },
    });

    expect(mappedResult).toEqual(['A', 'B', 'C']);

    wrapper.dispose();
  });

  test('data handler receives proxy — property access reads from data signal', () => {
    const qr = fakeQueryResult<{ title: string }>({
      loading: false,
      data: { title: 'First' },
    });

    let proxyRef: { title: string } | undefined;

    const wrapper = queryMatch(qr, {
      loading: () => null,
      error: () => null,
      data: (response) => {
        proxyRef = response; // capture the proxy reference
        return document.createElement('div');
      },
    });

    // Proxy initially reads from the current data signal value
    expect(proxyRef?.title).toBe('First');

    // Update data signal
    qr._data.value = { title: 'Second' };

    // Proxy should read the NEW value (live proxy, not a snapshot)
    expect(proxyRef?.title).toBe('Second');

    wrapper.dispose();
  });

  test('dispose creates fresh entry on next call', () => {
    const qr = fakeQueryResult<string>({ loading: true });

    const first = queryMatch(qr, {
      loading: () => document.createElement('div'),
      error: () => document.createElement('div'),
      data: () => document.createElement('div'),
    });

    first.dispose();

    // After dispose, next call should create a fresh wrapper
    const second = queryMatch(qr, {
      loading: () => document.createElement('div'),
      error: () => document.createElement('div'),
      data: () => document.createElement('div'),
    });

    expect(second).not.toBe(first);
    expect(second instanceof HTMLElement).toBe(true);
    expect(second.style.display).toBe('contents');

    second.dispose();
  });

  test('re-runs data handler when data signal changes within data branch', () => {
    const qr = fakeQueryResult<{ count: number }>({
      loading: false,
      data: { count: 1 },
    });

    let handlerCallCount = 0;

    const wrapper = queryMatch(qr, {
      loading: () => null,
      error: () => null,
      data: () => {
        handlerCallCount++;
        return document.createElement('div');
      },
    });

    expect(handlerCallCount).toBe(1);

    // Data changes → handler re-runs (compiler doesn't yet generate __list()
    // inside queryMatch callbacks, so .map() creates static DOM)
    qr._data.value = { count: 2 };

    expect(handlerCallCount).toBe(2);

    wrapper.dispose();
  });

  test('loading takes priority over error', () => {
    const qr = fakeQueryResult<string>({
      loading: true,
      error: new Error('fail'),
    });

    const loadingEl = document.createElement('div');

    const wrapper = queryMatch(qr, {
      loading: () => loadingEl,
      error: () => document.createElement('span'),
      data: () => document.createElement('div'),
    });

    expect(wrapper.children[0]).toBe(loadingEl);

    wrapper.dispose();
  });

  test('passes error value to error handler', () => {
    const err = new Error('something broke');
    const qr = fakeQueryResult<string>({
      loading: false,
      error: err,
    });

    let capturedError: unknown;

    const wrapper = queryMatch(qr, {
      loading: () => null,
      error: (e) => {
        capturedError = e;
        return document.createElement('div');
      },
      data: () => null,
    });

    expect(capturedError).toBe(err);

    wrapper.dispose();
  });

  test('shows loading when loading=false, error=undefined, data=undefined', () => {
    // Edge case: query with no data yet but not technically loading
    // (e.g., enabled:false or timing gap). Should show loading, not crash.
    const qr = fakeQueryResult<{ items: string[] }>({
      loading: false,
      data: undefined,
    });

    const loadingEl = document.createElement('div');
    loadingEl.textContent = 'Loading...';

    const wrapper = queryMatch(qr, {
      loading: () => loadingEl,
      error: () => document.createElement('div'),
      data: () => document.createElement('div'),
    });

    // Should fall back to loading when data is undefined
    expect(wrapper.children[0]).toBe(loadingEl);

    // When data becomes available, should switch to data branch
    qr._data.value = { items: ['a'] };

    expect(wrapper.children[0]).not.toBe(loadingEl);

    wrapper.dispose();
  });

  test('data handler does not receive revalidating parameter', () => {
    const qr = fakeQueryResult<string>({
      loading: false,
      data: 'hello',
    });

    let handlerArgCount = 0;

    const wrapper = queryMatch(qr, {
      loading: () => null,
      error: () => null,
      data: (...args: unknown[]) => {
        handlerArgCount = args.length;
        return document.createElement('div');
      },
    });

    // data handler should receive exactly 1 argument (data proxy)
    expect(handlerArgCount).toBe(1);

    wrapper.dispose();
  });
});
