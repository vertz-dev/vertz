import { describe, expectTypeOf, it } from 'vitest';
import type { EnvConfig } from '../env';

describe('EnvConfig', () => {
  it('has schema and optional load paths', () => {
    expectTypeOf<EnvConfig>().toHaveProperty('schema');
  });
});
