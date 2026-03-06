import { describe, expect, test } from 'bun:test';
import { __list } from '../../dom/list';
import { computed, domEffect, signal } from '../../runtime/signal';
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

  test('does NOT re-run data handler when data signal changes within data branch', () => {
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

    // Data changes within the same branch → handler does NOT re-run.
    // The data handler receives a Proxy that reads from the data signal
    // on every property access, so __list() and ListTransition domEffects
    // re-run automatically when data changes.
    qr._data.value = { count: 2 };

    expect(handlerCallCount).toBe(1);

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

  test('computed derived from query data updates __list inside data handler (content-based keys)', () => {
    const qr = fakeQueryResult<{ status: string }>({
      loading: false,
      data: { status: 'todo' },
    });

    const dataSignal = qr._data;
    const transitions = computed(() => {
      const d = dataSignal.value;
      if (!d) return [];
      return d.status === 'todo'
        ? [{ label: 'Start', key: 'start' }]
        : [{ label: 'Complete', key: 'complete' }];
    });

    const container = document.createElement('div');

    const wrapper = queryMatch(qr, {
      loading: () => document.createElement('div'),
      error: () => document.createElement('div'),
      data: () => {
        const el = document.createElement('div');
        __list(
          el,
          () => transitions.value,
          (item) => item.key,
          (item) => {
            const btn = document.createElement('button');
            btn.textContent = item.label;
            return btn;
          },
        );
        return el;
      },
    });
    container.appendChild(wrapper);

    const dataEl = wrapper.children[0] as HTMLElement;
    expect(dataEl.children.length).toBe(1);
    expect(dataEl.children[0]?.textContent).toBe('Start');

    qr._data.value = { status: 'in-progress' };

    expect(dataEl.children.length).toBe(1);
    expect(dataEl.children[0]?.textContent).toBe('Complete');

    wrapper.dispose();
  });

  test('__list updates reactive bindings when item changes at same index key', () => {
    // Reproduces the compiler-generated scenario: .map() without explicit key
    // generates index-based keyFn. __list wraps each item in a reactive proxy,
    // so when the item at a key changes, reactive bindings (domEffect, __child)
    // inside the node update automatically.
    const qr = fakeQueryResult<{ status: string }>({
      loading: false,
      data: { status: 'todo' },
    });

    const dataSignal = qr._data;
    const transitions = computed(() => {
      const d = dataSignal.value;
      if (!d) return [];
      return d.status === 'todo'
        ? [{ label: 'Start' }]
        : [{ label: 'Complete' }, { label: 'Back to Todo' }];
    });

    const container = document.createElement('div');

    const wrapper = queryMatch(qr, {
      loading: () => document.createElement('div'),
      error: () => document.createElement('div'),
      data: () => {
        const el = document.createElement('div');
        // Index-based key — matches compiler output for .map() without key prop.
        // renderFn uses domEffect for text content — matches compiler's __child().
        __list(
          el,
          () => transitions.value,
          (_item, __i) => __i,
          (item) => {
            const btn = document.createElement('button');
            // Simulate compiler-generated __child: reactive text binding
            domEffect(() => {
              btn.textContent = item.label;
            });
            return btn;
          },
        );
        return el;
      },
    });
    container.appendChild(wrapper);

    const dataEl = wrapper.children[0] as HTMLElement;
    expect(dataEl.children.length).toBe(1);
    expect(dataEl.children[0]?.textContent).toBe('Start');

    // Simulate refetch: status changes from 'todo' to 'in-progress'
    qr._data.value = { status: 'in-progress' };

    // Index key 0: node reused, but item proxy now reads from 'Complete'
    // Index key 1: new node created for 'Back to Todo'
    expect(dataEl.children.length).toBe(2);
    expect(dataEl.children[0]?.textContent).toBe('Complete');
    expect(dataEl.children[1]?.textContent).toBe('Back to Todo');

    wrapper.dispose();
  });
});
