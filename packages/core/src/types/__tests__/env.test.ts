import { describe, it, expectTypeOf } from 'vitest';
import type { EnvConfig } from '../env';

describe('EnvConfig', () => {
  it('has schema and optional load paths', () => {
    expectTypeOf<EnvConfig>().toHaveProperty('schema');
  });
});
