import { afterEach, beforeEach, describe, expect, test, vi } from '@vertz/test';
import { computed, domEffect } from '../../runtime/signal';
import { setReadValueCallback } from '../../runtime/tracking';
import { createTestSSRContext, disableTestSSR, enableTestSSR } from '../../ssr/test-ssr-helpers';
import type { SearchParamSchema } from '../define-routes';
import { defineRoutes } from '../define-routes';
import { createRouter } from '../navigate';
import { RouterContext } from '../router-context';
import { parseSearchParams, useSearchParams } from '../search-params';

describe('parseSearchParams', () => {
  test('parses search params from URLSearchParams with schema', () => {
    const urlParams = new URLSearchParams('page=3&sort=name');
    const schema = {
      parse(data: unknown) {
        const raw = data as Record<string, string>;
        return {
          ok: true as const,
          data: {
            page: Number(raw.page ?? '1'),
            sort: raw.sort ?? 'id',
          },
        };
      },
    };

    const result = parseSearchParams(urlParams, schema);
    expect(result).toEqual({ page: 3, sort: 'name' });
  });

  test('returns raw object when no schema provided', () => {
    const urlParams = new URLSearchParams('foo=bar&baz=42');
    const result = parseSearchParams(urlParams);
    expect(result).toEqual({ baz: '42', foo: 'bar' });
  });

  test('handles empty search params', () => {
    const urlParams = new URLSearchParams('');
    const result = parseSearchParams(urlParams);
    expect(result).toEqual({});
  });

  test('schema can provide defaults', () => {
    const urlParams = new URLSearchParams('');
    const schema = {
      parse(_data: unknown) {
        return { ok: true as const, data: { page: 1, sort: 'id' } };
      },
    };
    const result = parseSearchParams(urlParams, schema);
    expect(result).toEqual({ page: 1, sort: 'id' });
  });
});

describe('router.searchParams signal', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  test('exposes searchParams signal on router', () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/');
    expect(router.searchParams).toBeDefined();
    expect(router.searchParams.value).toEqual({});
  });

  test('searchParams signal updates on navigate with search schema', async () => {
    const schema = {
      parse(data: unknown) {
        const raw = data as Record<string, string>;
        return { ok: true as const, data: { page: Number(raw.page ?? '1') } };
      },
    };
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/items': { component: () => document.createElement('div'), searchParams: schema },
    });
    const router = createRouter(routes, '/');

    await router.navigate({ to: '/items', search: { page: 3 } });

    expect(router.searchParams.value).toEqual({ page: 3 });
  });

  test('search params schema.parse is called only once per navigation (no double parsing)', async () => {
    const parseSpy = vi.fn((data: unknown) => {
      const raw = data as Record<string, string>;
      return { ok: true as const, data: { page: Number(raw.page ?? '1') } };
    });
    const schema = { parse: parseSpy };
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/items': { component: () => document.createElement('div'), searchParams: schema },
    });
    const router = createRouter(routes, '/');

    parseSpy.mockClear();
    await router.navigate({ to: '/items', search: { page: 2 } });

    // matchRoute parses once; navigate should NOT parse again
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(router.searchParams.value).toEqual({ page: 2 });
  });

  test('schema defaults applied on SPA navigation without query params (#1927)', async () => {
    const schema = {
      parse(data: unknown) {
        const raw = data as Record<string, string>;
        return { ok: true as const, data: { page: Number(raw.page ?? '1') } };
      },
    };
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/items': { component: () => document.createElement('div'), searchParams: schema },
    });
    const router = createRouter(routes, '/');

    await router.navigate({ to: '/items' });

    expect(router.searchParams.value).toEqual({ page: 1 });
    router.dispose();
  });

  test('schema defaults available atomically with route change (#1927)', async () => {
    const schema = {
      parse(data: unknown) {
        const raw = data as Record<string, string>;
        return { ok: true as const, data: { page: Number(raw.page ?? '1') } };
      },
    };
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/items': { component: () => document.createElement('div'), searchParams: schema },
    });
    const router = createRouter(routes, '/');

    // Simulate what RouterView/components do: observe current and read searchParams
    const snapshots: Array<{ pattern: string | undefined; page: unknown }> = [];
    const dispose = domEffect(() => {
      const curr = router.current.value;
      const search = router.searchParams.value;
      if (curr?.route.pattern === '/items') {
        snapshots.push({ pattern: curr.route.pattern, page: search.page });
      }
    });

    await router.navigate({ to: '/items' });

    // The FIRST time the effect sees /items, page must already be 1 (schema default).
    // Before the fix, current was updated before searchParams, so the first
    // snapshot had page: undefined.
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    expect(snapshots[0]?.page).toBe(1);

    dispose();
    router.dispose();
  });

  test('schema defaults on nested route SPA navigation (#1927)', async () => {
    const schema = {
      parse(data: unknown) {
        const raw = data as Record<string, string>;
        return { ok: true as const, data: { page: Number(raw.page ?? '1') } };
      },
    };
    const routes = defineRoutes({
      '/': {
        component: () => document.createElement('div'),
        children: {
          '/brands': {
            component: () => document.createElement('div'),
            searchParams: schema,
          },
        },
      },
    });
    const router = createRouter(routes, '/');

    const snapshots: Array<{ page: unknown }> = [];
    const dispose = domEffect(() => {
      const curr = router.current.value;
      const search = router.searchParams.value;
      if (curr?.route.pattern === '/brands') {
        snapshots.push({ page: search.page });
      }
    });

    await router.navigate({ to: '/brands' });

    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    expect(snapshots[0]?.page).toBe(1);

    dispose();
    router.dispose();
  });

  test('schema defaults applied on popstate (back/forward) navigation (#1927)', async () => {
    const schema = {
      parse(data: unknown) {
        const raw = data as Record<string, string>;
        return { ok: true as const, data: { page: Number(raw.page ?? '1') } };
      },
    };
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/items': { component: () => document.createElement('div'), searchParams: schema },
    });
    const router = createRouter(routes, '/');

    // Navigate forward to /items?page=3
    await router.navigate({ to: '/items', search: { page: 3 } });
    expect(router.searchParams.value).toEqual({ page: 3 });

    const snapshots: Array<{ page: unknown }> = [];
    const dispose = domEffect(() => {
      const curr = router.current.value;
      const search = router.searchParams.value;
      if (curr?.route.pattern === '/items') {
        snapshots.push({ page: search.page });
      }
    });

    // Simulate browser back to /items (no ?page param → schema default).
    // happy-dom doesn't dispatch popstate on history.back(), so we
    // manually set location and dispatch the event.
    window.history.replaceState(null, '', '/items');
    window.dispatchEvent(new Event('popstate'));
    // Allow the async applyNavigation to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    // After popstate to /items (no query), page should be 1 (schema default)
    expect(snapshots[snapshots.length - 1]?.page).toBe(1);

    dispose();
    router.dispose();
  });
});

describe('useSearchParams() with RouterContext.Provider', () => {
  test('throws when called outside RouterContext.Provider', () => {
    expect(() => useSearchParams()).toThrow(
      'useSearchParams() must be called within RouterContext.Provider',
    );
  });

  test('returns reactive search params proxy inside provider', () => {
    const routes = defineRoutes({
      '/search': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/search?q=dragon&page=1');

    let sp: ReturnType<typeof useSearchParams> | undefined;
    RouterContext.Provider(router, () => {
      sp = useSearchParams();
    });

    expect(sp).toBeDefined();
    expect(sp!.q).toBe('dragon');
    expect(sp!.page).toBe('1');
    router.dispose();
  });

  test('Object.keys returns current search param names', () => {
    const routes = defineRoutes({
      '/search': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/search?q=dragon&page=1');

    let sp: ReturnType<typeof useSearchParams> | undefined;
    RouterContext.Provider(router, () => {
      sp = useSearchParams();
    });

    expect(Object.keys(sp!).sort()).toEqual(['page', 'q']);
    router.dispose();
  });

  test('spread creates a plain object copy', () => {
    const routes = defineRoutes({
      '/search': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/search?q=dragon&page=1');

    let sp: ReturnType<typeof useSearchParams> | undefined;
    RouterContext.Provider(router, () => {
      sp = useSearchParams();
    });

    const copy = { ...sp! };
    expect(copy).toEqual({ page: '1', q: 'dragon' });
    router.dispose();
  });

  test('"in" operator works for existing and missing params', () => {
    const routes = defineRoutes({
      '/search': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/search?q=dragon');

    let sp: ReturnType<typeof useSearchParams> | undefined;
    RouterContext.Provider(router, () => {
      sp = useSearchParams();
    });

    expect('q' in sp!).toBe(true);
    expect('missing' in sp!).toBe(false);
    expect('navigate' in sp!).toBe(true);
    router.dispose();
  });

  test('navigate method is accessible from provider context', () => {
    const routes = defineRoutes({
      '/search': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/search?q=dragon');

    let sp: ReturnType<typeof useSearchParams> | undefined;
    RouterContext.Provider(router, () => {
      sp = useSearchParams();
    });

    expect(typeof sp!.navigate).toBe('function');
    router.dispose();
  });

  test('returns empty proxy for route with no search params', () => {
    const routes = defineRoutes({
      '/home': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, '/home');

    let sp: ReturnType<typeof useSearchParams> | undefined;
    RouterContext.Provider(router, () => {
      sp = useSearchParams();
    });

    expect(Object.keys(sp!)).toEqual([]);
    expect(sp!.anyParam).toBeUndefined();
    router.dispose();
  });

  test('returns schema-parsed search params when route has searchParams schema', () => {
    const searchSchema: SearchParamSchema<{ q: string; page: number }> = {
      parse(data: unknown) {
        const raw = data as Record<string, string>;
        const page = Number(raw.page);
        if (Number.isNaN(page)) return { ok: false, error: 'page must be a number' };
        return { ok: true, data: { q: String(raw.q ?? ''), page } };
      },
    };

    const routes = defineRoutes({
      '/search': {
        component: () => document.createElement('div'),
        searchParams: searchSchema,
      },
    });
    const router = createRouter(routes, '/search?q=dragon&page=3');

    let sp: ReturnType<typeof useSearchParams> | undefined;
    RouterContext.Provider(router, () => {
      sp = useSearchParams();
    });

    // Schema coerces page from string '3' to number 3
    expect(sp!.q).toBe('dragon');
    expect(sp!.page).toBe(3);
    router.dispose();
  });
});

describe('SSR reactive search params safety', () => {
  afterEach(() => {
    disableTestSSR();
  });

  test('SSR proxy reads return correct values', () => {
    enableTestSSR(createTestSSRContext('/search?q=dragon&page=1'));
    const routes = defineRoutes({
      '/search': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);

    let sp: ReturnType<typeof useSearchParams> | undefined;
    RouterContext.Provider(router, () => {
      sp = useSearchParams();
    });

    expect(sp!.q).toBe('dragon');
    expect(sp!.page).toBe('1');
    expect(sp!.missing).toBeUndefined();
  });

  test('SSR proxy set throws in dev mode', () => {
    enableTestSSR(createTestSSRContext('/search?q=dragon'));
    const routes = defineRoutes({
      '/search': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);

    let sp: ReturnType<typeof useSearchParams> | undefined;
    RouterContext.Provider(router, () => {
      sp = useSearchParams();
    });

    expect(() => {
      sp!.q = 'phoenix';
    }).toThrow('useSearchParams() writes are not supported during SSR');
  });

  test('SSR proxy delete throws in dev mode', () => {
    enableTestSSR(createTestSSRContext('/search?q=dragon'));
    const routes = defineRoutes({
      '/search': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);

    let sp: ReturnType<typeof useSearchParams> | undefined;
    RouterContext.Provider(router, () => {
      sp = useSearchParams();
    });

    expect(() => {
      delete sp!.q;
    }).toThrow('useSearchParams() writes are not supported during SSR');
  });

  test('SSR proxy navigate() throws in dev mode', () => {
    enableTestSSR(createTestSSRContext('/search?q=dragon'));
    const routes = defineRoutes({
      '/search': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);

    let sp: ReturnType<typeof useSearchParams> | undefined;
    RouterContext.Provider(router, () => {
      sp = useSearchParams();
    });

    expect(() => {
      sp!.navigate({ q: 'phoenix' });
    }).toThrow('useSearchParams().navigate() is not supported during SSR');
  });

  test('SSR proxy Object.keys returns param names', () => {
    enableTestSSR(createTestSSRContext('/search?q=dragon&page=1'));
    const routes = defineRoutes({
      '/search': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes);

    let sp: ReturnType<typeof useSearchParams> | undefined;
    RouterContext.Provider(router, () => {
      sp = useSearchParams();
    });

    expect(Object.keys(sp!).sort()).toEqual(['page', 'q']);
  });

  test('SSR proxy triggers readValueCallback inside computed (#1925)', () => {
    enableTestSSR(createTestSSRContext('/brands?page=2'));
    const schema: SearchParamSchema<{ page: number }> = {
      parse(data: unknown) {
        const raw = data as Record<string, string>;
        return {
          ok: true as const,
          data: { page: Number(raw.page ?? '1') },
        };
      },
    };
    const routes = defineRoutes({
      '/brands': {
        component: () => document.createElement('div'),
        searchParams: schema,
      },
    });
    const router = createRouter(routes);

    let sp: ReturnType<typeof useSearchParams> | undefined;
    RouterContext.Provider(router, () => {
      sp = useSearchParams();
    });

    // Simulate callThunkWithCapture() reading search params through a
    // computed (the compiler wraps derived expressions in computed).
    // Inside a computed, getSubscriber() returns the computed itself,
    // which gates the readValueCallback invocation in SignalImpl.value.
    // The SSR proxy must match this behavior.
    const captured: unknown[] = [];
    const prevCb = setReadValueCallback((v) => captured.push(v));

    // Create a computed that reads search params — mirrors what the
    // compiler does with `const offset = (params.page - 1) * 20`
    const offset = computed(() => ((sp!.page as number) - 1) * 20);

    try {
      // Trigger computed evaluation (simulates thunk reading `offset`)
      const _val = offset.value;
      expect(_val).toBe(20); // page=2 → offset=20
    } finally {
      setReadValueCallback(prevCb);
    }

    // Client signal reads invoke callback with the full object value.
    // SSR must do the same so dep hashes match during hydration.
    expect(captured.length).toBe(1);
    expect(captured[0]).toEqual({ page: 2 });
  });

  test('SSR and client dep hash match for search-params-derived computed (#1925)', () => {
    const PAGE_SIZE = 20;
    const schema: SearchParamSchema<{ page: number }> = {
      parse(data: unknown) {
        const raw = data as Record<string, string>;
        return {
          ok: true as const,
          data: { page: Number(raw.page ?? '1') },
        };
      },
    };
    const routes = defineRoutes({
      '/brands': {
        component: () => document.createElement('div'),
        searchParams: schema,
      },
    });

    // ── SSR side ──
    enableTestSSR(createTestSSRContext('/brands?page=2'));
    const ssrRouter = createRouter(routes);

    let ssrSp: ReturnType<typeof useSearchParams> | undefined;
    RouterContext.Provider(ssrRouter, () => {
      ssrSp = useSearchParams();
    });

    // Compute dep hash as callThunkWithCapture() would during SSR
    const ssrCaptured: unknown[] = [];
    const prevCb1 = setReadValueCallback((v) => ssrCaptured.push(v));
    const ssrOffset = computed(() => ((ssrSp!.page as number) - 1) * PAGE_SIZE);
    try {
      ssrOffset.value;
    } finally {
      setReadValueCallback(prevCb1);
    }

    disableTestSSR();

    // ── Client side ──
    // Pass initialUrl to avoid window.location dependency
    const clientRouter = createRouter(routes, '/brands?page=2');

    let clientSp: ReturnType<typeof useSearchParams> | undefined;
    RouterContext.Provider(clientRouter, () => {
      clientSp = useSearchParams();
    });

    const clientCaptured: unknown[] = [];
    const prevCb2 = setReadValueCallback((v) => clientCaptured.push(v));
    const clientOffset = computed(() => ((clientSp!.page as number) - 1) * PAGE_SIZE);
    try {
      clientOffset.value;
    } finally {
      setReadValueCallback(prevCb2);
    }

    // Core assertion: SSR and client captured the same values
    // → dep hashes match → hydration key match → no content wipe
    expect(ssrCaptured.length).toBe(clientCaptured.length);
    expect(JSON.stringify(ssrCaptured)).toBe(JSON.stringify(clientCaptured));
  });
});
