import { describe, it, expect, afterEach } from 'vitest';
import { buildDeps } from '../deps-builder';

describe('buildDeps', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('combines options, env, and injected services into a flat object', () => {
    const deps = buildDeps({
      options: { maxRetries: 3 },
      env: { DATABASE_URL: 'postgres://localhost' },
      services: { dbService: { query: () => {} } },
    });

    expect(deps.options).toEqual({ maxRetries: 3 });
    expect(deps.env).toEqual({ DATABASE_URL: 'postgres://localhost' });
    expect(deps.dbService).toBeDefined();
  });

  it('returns an immutable object in development mode', () => {
    process.env.NODE_ENV = 'development';

    const deps = buildDeps({
      options: { maxRetries: 3 },
      env: {},
      services: {},
    });

    expect(() => {
      (deps as any).options = 'mutated';
    }).toThrow();
  });
});
