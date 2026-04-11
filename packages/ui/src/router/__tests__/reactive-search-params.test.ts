import { afterEach, describe, expect, test, vi, mock } from '@vertz/test';
import { signal } from '../../runtime/signal';
import type { Signal } from '../../runtime/signal-types';
import { createReactiveSearchParams } from '../reactive-search-params';

/**
 * Helper: create a mock navigate function that records calls and applies
 * the search params to the signal (simulating what the real router does).
 */
function createMockNavigate(searchSignal: Signal<Record<string, unknown>>) {
  const calls: Array<{ to: string; search: Record<string, unknown>; replace: boolean }> = [];
  const navigate = mock(
    async (input: { to: string; search?: Record<string, unknown>; replace?: boolean }) => {
      calls.push({
        to: input.to,
        search: input.search ?? {},
        replace: input.replace ?? false,
      });
      // Simulate what the real router does after navigate: update the signal
      if (input.search) {
        searchSignal.value = input.search;
      }
    },
  );
  return { navigate, calls };
}

describe('createReactiveSearchParams', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('reading', () => {
    test('reads properties from the underlying signal', () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon', page: 2 });
      const sp = createReactiveSearchParams(sig, mock());

      expect(sp.q).toBe('dragon');
      expect(sp.page).toBe(2);
    });

    test('returns undefined for missing properties', () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon' });
      const sp = createReactiveSearchParams(sig, mock());

      expect(sp.missing).toBeUndefined();
    });

    test('reflects signal changes', () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon' });
      const sp = createReactiveSearchParams(sig, mock());

      expect(sp.q).toBe('dragon');
      sig.value = { q: 'phoenix' };
      expect(sp.q).toBe('phoenix');
    });
  });

  describe('writing', () => {
    test('queues a write and flushes via microtask', async () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon', page: 1 });
      const { navigate } = createMockNavigate(sig);
      const sp = createReactiveSearchParams(sig, navigate);

      sp.page = 2;

      // Not flushed yet synchronously
      expect(navigate).not.toHaveBeenCalled();

      // Wait for microtask
      await Promise.resolve();

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          search: { q: 'dragon', page: 2 },
          replace: true,
        }),
      );
    });

    test('read-after-write returns the pending value', () => {
      const sig = signal<Record<string, unknown>>({ page: 1 });
      const sp = createReactiveSearchParams(sig, mock());

      sp.page = 2;
      expect(sp.page).toBe(2);
    });

    test('batches multiple writes into a single navigate', async () => {
      const sig = signal<Record<string, unknown>>({ q: '', page: 1, sort: 'relevance' });
      const { navigate } = createMockNavigate(sig);
      const sp = createReactiveSearchParams(sig, navigate);

      sp.q = 'dragon';
      sp.page = 3;
      sp.sort = 'price';

      await Promise.resolve();

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          search: { q: 'dragon', page: 3, sort: 'price' },
        }),
      );
    });

    test('skips navigate when merged params equal current signal', async () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon', page: 1 });
      const { navigate } = createMockNavigate(sig);
      const sp = createReactiveSearchParams(sig, navigate);

      // Write same values
      sp.q = 'dragon';
      sp.page = 1;

      await Promise.resolve();

      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('removing params', () => {
    test('setting a param to undefined removes it', async () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon', page: 1 });
      const { navigate } = createMockNavigate(sig);
      const sp = createReactiveSearchParams(sig, navigate);

      sp.q = undefined;

      await Promise.resolve();

      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          search: { page: 1 },
        }),
      );
    });

    test('setting a param to null removes it', async () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon', page: 1 });
      const { navigate } = createMockNavigate(sig);
      const sp = createReactiveSearchParams(sig, navigate);

      sp.q = null;

      await Promise.resolve();

      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          search: { page: 1 },
        }),
      );
    });

    test('delete operator removes a param', async () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon', page: 1 });
      const { navigate } = createMockNavigate(sig);
      const sp = createReactiveSearchParams(sig, navigate);

      delete sp.q;

      await Promise.resolve();

      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          search: { page: 1 },
        }),
      );
    });
  });

  describe('introspection', () => {
    test('Object.keys returns current param names', () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon', page: 1 });
      const sp = createReactiveSearchParams(sig, mock());

      expect(Object.keys(sp).sort()).toEqual(['page', 'q']);
    });

    test('spread creates a plain object copy', () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon', page: 1 });
      const sp = createReactiveSearchParams(sig, mock());

      const copy = { ...sp };
      expect(copy).toEqual({ q: 'dragon', page: 1 });
    });

    test('JSON.stringify serializes current params', () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon', page: 1 });
      const sp = createReactiveSearchParams(sig, mock());

      const json = JSON.stringify(sp);
      expect(JSON.parse(json)).toEqual({ page: 1, q: 'dragon' });
    });

    test('"key" in sp returns true for existing params', () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon' });
      const sp = createReactiveSearchParams(sig, mock());

      expect('q' in sp).toBe(true);
      expect('missing' in sp).toBe(false);
    });

    test('Object.keys reflects pending writes', () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon' });
      const sp = createReactiveSearchParams(sig, mock());

      sp.page = 1;
      expect(Object.keys(sp).sort()).toEqual(['page', 'q']);
    });

    test('Object.keys excludes params pending deletion', () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon', page: 1 });
      const sp = createReactiveSearchParams(sig, mock());

      sp.q = undefined;
      expect(Object.keys(sp)).toEqual(['page']);
    });
  });

  describe('navigate method', () => {
    test('sp.navigate merges partial params and navigates', async () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon', page: 1 });
      const { navigate } = createMockNavigate(sig);
      const sp = createReactiveSearchParams(sig, navigate);

      sp.navigate({ page: 3 });

      // navigate() is synchronous (not microtask-batched)
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          search: { q: 'dragon', page: 3 },
          replace: true,
        }),
      );
    });

    test('sp.navigate with push: true creates history entry', async () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon', page: 1 });
      const { navigate } = createMockNavigate(sig);
      const sp = createReactiveSearchParams(sig, navigate);

      sp.navigate({ page: 2 }, { push: true });

      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          replace: false,
        }),
      );
    });

    test('sp.navigate removes null/undefined values', async () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon', page: 1, sort: 'name' });
      const { navigate } = createMockNavigate(sig);
      const sp = createReactiveSearchParams(sig, navigate);

      sp.navigate({ q: undefined, sort: null });

      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          search: { page: 1 },
        }),
      );
    });

    test('sp.navigate cancels pending batch to avoid double navigation', async () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon', page: 1 });
      const { navigate } = createMockNavigate(sig);
      const sp = createReactiveSearchParams(sig, navigate);

      // Queue a batch write
      sp.page = 2;
      // Then call navigate() synchronously — should cancel the pending batch
      sp.navigate({ sort: 'name' });

      // navigate() fires synchronously
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          search: { q: 'dragon', page: 1, sort: 'name' },
        }),
      );

      // Wait for microtask — the cancelled batch should NOT fire
      await Promise.resolve();
      expect(navigate).toHaveBeenCalledTimes(1);
    });
  });

  describe('serial batches', () => {
    test('second batch reads updated signal from first batch', async () => {
      const sig = signal<Record<string, unknown>>({ q: 'dragon', page: 1 });
      const { navigate } = createMockNavigate(sig);
      const sp = createReactiveSearchParams(sig, navigate);

      // First batch
      sp.page = 2;
      await Promise.resolve();
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(sig.value).toEqual({ q: 'dragon', page: 2 });

      // Second batch — should read the updated signal
      sp.sort = 'name';
      await Promise.resolve();
      expect(navigate).toHaveBeenCalledTimes(2);
      expect(navigate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: { q: 'dragon', page: 2, sort: 'name' },
        }),
      );
    });
  });
});
