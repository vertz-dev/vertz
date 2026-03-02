import { getAdapter, isRenderNode } from '../dom/adapter';
import { _tryOnCleanup, popScope, pushScope, runCleanups } from '../runtime/disposal';
import { domEffect } from '../runtime/signal';
import type { DisposeFn, Signal } from '../runtime/signal-types';
import type { QueryResult } from './query';

export interface QueryMatchHandlers<T, E> {
  loading: () => Node | null;
  error: (error: E) => Node | null;
  data: (data: T) => Node | null;
}

type Branch = 'loading' | 'error' | 'data';

interface CachedEntry<T, E> {
  wrapper: HTMLElement & { dispose: DisposeFn };
  handlers: QueryMatchHandlers<T, E>;
  disposed: boolean;
}

/** WeakMap cache: same queryResult → same wrapper node. */
const cache = new WeakMap<QueryResult<unknown, unknown>, CachedEntry<unknown, unknown>>();

/**
 * Pattern-match on a QueryResult's exclusive state.
 *
 * Returns a stable `<span style="display:contents">` wrapper that internally
 * manages branch switching (loading/error/data) via a reactive effect.
 * The same wrapper is returned for repeated calls with the same queryResult
 * (cached via WeakMap), enabling __child's stable-node optimization.
 *
 * Priority: loading → error → data.
 *
 * `loading` only fires on the initial load (no data yet).
 * When revalidating with existing data, the `data` handler receives the
 * current data. Access `query.revalidating` from the component scope for
 * revalidation state.
 */
export function queryMatch<T, E>(
  queryResult: QueryResult<T, E>,
  handlers: QueryMatchHandlers<T, E>,
): HTMLElement & { dispose: DisposeFn } {
  const key = queryResult as unknown as QueryResult<unknown, unknown>;
  const existing = cache.get(key) as CachedEntry<T, E> | undefined;

  if (existing && !existing.disposed) {
    // Update handlers reference so the latest closures are used
    existing.handlers = handlers;
    return existing.wrapper;
  }

  // Delete stale disposed entry
  if (existing) {
    cache.delete(key);
  }

  const wrapper = getAdapter().createElement('span') as unknown as HTMLElement & {
    dispose: DisposeFn;
  };
  wrapper.style.display = 'contents';

  const entry: CachedEntry<T, E> = { wrapper, handlers, disposed: false };
  cache.set(key, entry as CachedEntry<unknown, unknown>);

  let currentBranch: Branch | null = null;
  let branchCleanups: DisposeFn[] = [];

  const outerScope = pushScope();

  domEffect(() => {
    // Read signal values to subscribe to query state changes.
    const isLoading = (queryResult.loading as unknown as Signal<boolean>).value;
    const err = (queryResult.error as unknown as Signal<E | undefined>).value;
    const dataValue = (queryResult.data as unknown as Signal<T | undefined>).value;

    // Determine branch
    // Priority: loading → error → data.
    // Fall back to loading when data is still undefined (e.g., enabled:false
    // or timing gap between loading=false and data being set).
    let branch: Branch;
    if (isLoading || (err === undefined && dataValue === undefined)) {
      branch = 'loading';
    } else if (err !== undefined) {
      branch = 'error';
    } else {
      branch = 'data';
    }

    // Same branch → skip DOM work
    if (branch === currentBranch) {
      return;
    }

    // Clean up previous branch
    runCleanups(branchCleanups);
    while (wrapper.firstChild) {
      wrapper.removeChild(wrapper.firstChild);
    }

    currentBranch = branch;

    // Create new branch content in a fresh disposal scope
    const scope = pushScope();
    let branchResult: Node | null = null;

    if (branch === 'loading') {
      branchResult = entry.handlers.loading();
    } else if (branch === 'error') {
      branchResult = entry.handlers.error(err as E);
    } else {
      // Create a Proxy that reads from the data signal on every property access.
      // This makes `response.items` inside the data handler reactive — when read
      // inside a nested domEffect (e.g., __list), the effect subscribes to the
      // data signal and re-runs when data changes.
      const dataSignal = queryResult.data as unknown as Signal<T | undefined>;
      const dataProxy = new Proxy(
        {},
        {
          get(_target, prop, receiver) {
            const current = dataSignal.value;
            if (current == null) return undefined;
            const value = Reflect.get(current as object, prop, receiver);
            // Bind function values (e.g., .map(), .filter()) to the current data
            // so they operate on the live data, not the proxy.
            if (typeof value === 'function') {
              return value.bind(current);
            }
            return value;
          },
          has(_target, prop) {
            const current = dataSignal.value;
            if (current == null) return false;
            return Reflect.has(current as object, prop);
          },
          ownKeys() {
            const current = dataSignal.value;
            if (current == null) return [];
            return Reflect.ownKeys(current as object);
          },
          getOwnPropertyDescriptor(_target, prop) {
            const current = dataSignal.value;
            if (current == null) return undefined;
            return Reflect.getOwnPropertyDescriptor(current as object, prop);
          },
        },
      ) as T;
      branchResult = entry.handlers.data(dataProxy);
    }

    popScope();
    branchCleanups = scope;

    if (branchResult != null && isRenderNode(branchResult)) {
      wrapper.appendChild(branchResult as Node);
    }
  });

  popScope();

  const dispose = () => {
    entry.disposed = true;
    runCleanups(branchCleanups);
    runCleanups(outerScope);
    cache.delete(key);
  };

  wrapper.dispose = dispose;
  _tryOnCleanup(dispose);

  return wrapper;
}
