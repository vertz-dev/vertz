import { describe, expectTypeOf, it } from 'bun:test';
import type { AppConfig, CorsConfig } from '../app';

describe('AppConfig', () => {
  it('has optional basePath, version, cors', () => {
    expectTypeOf<AppConfig>().toHaveProperty('basePath');
    expectTypeOf<AppConfig>().toHaveProperty('version');
    expectTypeOf<AppConfig>().toHaveProperty('cors');
  });
});

describe('CorsConfig', () => {
  it('has optional origins and credentials', () => {
    expectTypeOf<CorsConfig>().toHaveProperty('origins');
    expectTypeOf<CorsConfig>().toHaveProperty('credentials');
  });
});
