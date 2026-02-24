import { describe, expectTypeOf, it } from 'bun:test';
import type { RawRequest } from '../context';

describe('RawRequest', () => {
  it('wraps a standard Request with method, url, and headers', () => {
    expectTypeOf<RawRequest>().toHaveProperty('request');
    expectTypeOf<RawRequest>().toHaveProperty('method');
    expectTypeOf<RawRequest>().toHaveProperty('url');
    expectTypeOf<RawRequest>().toHaveProperty('headers');
  });
});
