import { describe, expect, test, vi } from 'vitest';
import { signal } from '../../runtime/signal';
import { defineRoutes } from '../define-routes';
import { createRouter } from '../navigate';
import { parseSearchParams, useSearchParams } from '../search-params';

describe('parseSearchParams', () => {
  test('parses search params from URLSearchParams with schema', () => {
    const urlParams = new URLSearchParams('page=3&sort=name');
    const schema = {
      parse(data: unknown) {
        const raw = data as Record<string, string>;
        return {
          page: Number(raw.page ?? '1'),
          sort: raw.sort ?? 'id',
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
        return { page: 1, sort: 'id' };
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
        return { page: Number(raw.page ?? '1') };
      },
    };
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/items': { component: () => document.createElement('div'), searchParams: schema },
    });
    const router = createRouter(routes, '/');

    await router.navigate('/items?page=3');

    expect(router.searchParams.value).toEqual({ page: 3 });
  });

  test('useSearchParams reads from router.searchParams', async () => {
    const schema = {
      parse(data: unknown) {
        const raw = data as Record<string, string>;
        return { page: Number(raw.page ?? '1') };
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
      return { page: Number(raw.page ?? '1') };
    });
    const schema = { parse: parseSpy };
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/items': { component: () => document.createElement('div'), searchParams: schema },
    });
    const router = createRouter(routes, '/');

    parseSpy.mockClear();
    await router.navigate('/items?page=2');

    // matchRoute parses once; navigate should NOT parse again
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(router.searchParams.value).toEqual({ page: 2 });
  });
});
