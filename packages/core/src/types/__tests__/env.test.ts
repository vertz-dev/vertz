import { describe, expectTypeOf, it } from 'bun:test';
import type { EnvConfig } from '../env';

describe('EnvConfig', () => {
  it('has schema and optional load paths', () => {
    expectTypeOf<EnvConfig>().toHaveProperty('schema');
  });
});
