import { describe, expectTypeOf, it } from 'vitest';
import type { HttpMethod } from '../http';

describe('HttpMethod', () => {
  it('includes standard HTTP methods', () => {
    expectTypeOf<'GET'>().toMatchTypeOf<HttpMethod>();
    expectTypeOf<'POST'>().toMatchTypeOf<HttpMethod>();
    expectTypeOf<'PUT'>().toMatchTypeOf<HttpMethod>();
    expectTypeOf<'PATCH'>().toMatchTypeOf<HttpMethod>();
    expectTypeOf<'DELETE'>().toMatchTypeOf<HttpMethod>();
    expectTypeOf<'HEAD'>().toMatchTypeOf<HttpMethod>();
    expectTypeOf<'OPTIONS'>().toMatchTypeOf<HttpMethod>();
  });

  it('rejects invalid methods', () => {
    expectTypeOf<'INVALID'>().not.toMatchTypeOf<HttpMethod>();
  });
});
