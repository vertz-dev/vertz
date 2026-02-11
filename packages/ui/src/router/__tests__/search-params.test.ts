import { describe, expect, test } from 'vitest';
import { signal } from '../../runtime/signal';
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
