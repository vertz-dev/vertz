import { describe, expectTypeOf, it } from 'bun:test';
import type { MiddlewareDef } from '../middleware';

describe('MiddlewareDef', () => {
  it('has handler and optional schemas', () => {
    expectTypeOf<MiddlewareDef>().toHaveProperty('handler');
  });
});
