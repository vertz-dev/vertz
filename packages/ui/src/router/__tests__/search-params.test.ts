import { afterEach, describe, expect, test, vi } from 'bun:test';
import { signal } from '../../runtime/signal';
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

describe('useSearchParams', () => {
  test('returns current search params from signal', () => {
    const searchSignal = signal<Record<string, unknown>>({ page: 1 });
    const result = useSearchParams(searchSignal);
    expect(result).toEqual({ page: 1 });
  });

  test('reflects signal updates', () => {
    const searchSignal = signal<Record<string, unknown>>({ page: 1 });
    expect(useSearchParams(searchSignal)).toEqual({ page: 1 });

    searchSignal.value = { page: 2, sort: 'name' };
    expect(useSearchParams(searchSignal)).toEqual({ page: 2, sort: 'name' });
  });
});

describe('router.searchParams signal', () => {
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

  test('useSearchParams reads from router.searchParams', async () => {
    const schema = {
      parse(data: unknown) {
        const raw = data as Record<string, string>;
        return { ok: true as const, data: { page: Number(raw.page ?? '1') } };
      },
    };
    const routes = defineRoutes({
      '/items': { component: () => document.createElement('div'), searchParams: schema },
    });
    const router = createRouter(routes, '/items?page=5');

    // Allow initial loaders to settle
    await new Promise((r) => setTimeout(r, 10));

    const params = useSearchParams(router.searchParams);
    expect(params).toEqual({ page: 5 });
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

  test('deprecated signal overload still works', () => {
    const sig = signal<Record<string, unknown>>({ q: 'dragon', page: 1 });
    const result = useSearchParams(sig);
    expect(result).toEqual({ q: 'dragon', page: 1 });
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
});
