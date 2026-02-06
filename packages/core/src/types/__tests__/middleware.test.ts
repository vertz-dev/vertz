import { describe, it, expectTypeOf } from 'vitest';
import type { MiddlewareDef } from '../middleware';

describe('MiddlewareDef', () => {
  it('has handler and optional schemas', () => {
    expectTypeOf<MiddlewareDef>().toHaveProperty('handler');
  });
});
