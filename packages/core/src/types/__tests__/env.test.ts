import { describe, expectTypeOf, it } from '@vertz/test';
import type { EnvConfig } from '../env';

describe('EnvConfig', () => {
  it('has schema and optional load paths', () => {
    expectTypeOf<EnvConfig>().toHaveProperty('schema');
  });
});
