import { describe, expectTypeOf, it } from 'vitest';
import type { AppConfig, CorsConfig } from '../app';

describe('AppConfig', () => {
  it('has optional basePath, version, cors', () => {
    expectTypeOf<AppConfig>().toHaveProperty('basePath');
    expectTypeOf<AppConfig>().toHaveProperty('version');
    expectTypeOf<AppConfig>().toHaveProperty('cors');
  });

  it('has optional validateResponses for dev mode', () => {
    expectTypeOf<AppConfig>().toHaveProperty('validateResponses');
  });
});

describe('CorsConfig', () => {
  it('has optional origins and credentials', () => {
    expectTypeOf<CorsConfig>().toHaveProperty('origins');
    expectTypeOf<CorsConfig>().toHaveProperty('credentials');
  });
});
