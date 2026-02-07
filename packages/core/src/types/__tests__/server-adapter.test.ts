import { describe, expectTypeOf, it } from 'vitest';
import type { ServerAdapter, ServerHandle } from '../server-adapter';

describe('ServerAdapter', () => {
  it('defines listen method returning Promise<ServerHandle>', () => {
    expectTypeOf<ServerAdapter['listen']>().returns.toEqualTypeOf<Promise<ServerHandle>>();
  });
});

describe('ServerHandle', () => {
  it('has port, hostname, and close()', () => {
    expectTypeOf<ServerHandle>().toHaveProperty('port');
    expectTypeOf<ServerHandle>().toHaveProperty('hostname');
    expectTypeOf<ServerHandle>().toHaveProperty('close');
  });
});
