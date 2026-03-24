/**
 * Reactive search params proxy.
 *
 * Returns a Proxy over the router's searchParams signal that:
 * - Reads: access signal.value[key] (triggers reactive tracking)
 * - Writes: batches changes via microtask, then navigates with replace
 * - Deletes: removes params from the URL
 * - Introspects: supports Object.keys, spread, JSON.stringify, `in`
 *
 * **Value types:** Search params are strings in the URL. Without a route
 * schema, values round-trip as strings (e.g., `sp.page = 2` becomes `'2'`
 * after the URL update). With a `searchParams` schema on the route definition,
 * values are parsed back through the schema on each URL change.
 */

import type { Signal } from '../runtime/signal-types';
import type { NavigateInput, NavigateSearch } from './navigate';

export type NavigateFn = (input: NavigateInput) => Promise<void>;

export interface ReactiveSearchParams<T = Record<string, unknown>> {
  /** Batch-navigate with explicit push/replace option. Merges partial with current params. */
  navigate(partial: Partial<T>, options?: { push?: boolean }): void;
  [key: string]: unknown;
}

/**
 * Check shallow equality of two plain objects.
 */
function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Build the merged search object from the current signal value and pending writes.
 * Filters out undefined/null values (removes those params).
 */
function buildMergedSearch(
  current: Record<string, unknown>,
  pending: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...current };
  for (const [key, value] of Object.entries(pending)) {
    if (value === undefined || value === null) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function currentPathname(): string {
  return typeof window !== 'undefined' ? window.location.pathname : '/';
}

export function createReactiveSearchParams<T = Record<string, unknown>>(
  rawSearchParamsSignal: Signal<Record<string, unknown>>,
  navigateFn: NavigateFn,
): ReactiveSearchParams<T> {
  let pending: Record<string, unknown> | null = null;
  /** Pathname captured when the first write in a batch occurs. */
  let capturedPathname: string | null = null;

  function flush() {
    if (!pending) return;
    const merged = buildMergedSearch(rawSearchParamsSignal.value, pending);
    const pathname = capturedPathname ?? currentPathname();
    pending = null;
    capturedPathname = null;

    // Skip navigate if nothing actually changed
    if (shallowEqual(merged, rawSearchParamsSignal.value)) return;

    navigateFn({
      to: pathname,
      search: merged as NavigateSearch,
      replace: true,
    });
  }

  function navigateWithOptions(
    partial: Record<string, unknown>,
    options?: { push?: boolean },
  ): void {
    // Cancel any pending batch to avoid double navigation
    pending = null;
    capturedPathname = null;

    const merged = buildMergedSearch(rawSearchParamsSignal.value, partial);
    navigateFn({
      to: currentPathname(),
      search: merged as NavigateSearch,
      replace: !options?.push,
    });
  }

  return new Proxy({} as ReactiveSearchParams<T>, {
    get(_target, key: string | symbol) {
      if (key === 'navigate') return navigateWithOptions;

      // Symbol access (Symbol.toPrimitive, Symbol.iterator, etc.)
      if (typeof key === 'symbol') return undefined;

      // Check pending first for read-after-write consistency
      if (pending && key in pending) return pending[key];

      // Read from signal — triggers reactive dependency tracking
      return rawSearchParamsSignal.value[key];
    },
    set(_target, key: string | symbol, value: unknown) {
      if (typeof key === 'symbol') return false;

      if (!pending) {
        pending = {};
        capturedPathname = currentPathname();
        queueMicrotask(flush);
      }
      pending[key] = value;
      return true;
    },
    deleteProperty(_target, key: string | symbol) {
      if (typeof key === 'symbol') return false;

      if (!pending) {
        pending = {};
        capturedPathname = currentPathname();
        queueMicrotask(flush);
      }
      pending[key] = undefined;
      return true;
    },
    ownKeys() {
      const current = pending
        ? buildMergedSearch(rawSearchParamsSignal.value, pending)
        : rawSearchParamsSignal.value;
      return Object.keys(current);
    },
    getOwnPropertyDescriptor(_target, key: string | symbol) {
      if (typeof key === 'symbol') return undefined;

      const val = pending && key in pending ? pending[key] : rawSearchParamsSignal.value[key];
      if (val === undefined || val === null) return undefined;
      return { configurable: true, enumerable: true, writable: true, value: val };
    },
    has(_target, key: string | symbol) {
      if (typeof key === 'symbol') return false;
      if (key === 'navigate') return true;

      if (pending && key in pending) {
        return pending[key] !== undefined && pending[key] !== null;
      }
      return key in rawSearchParamsSignal.value;
    },
  });
}
