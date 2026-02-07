import { afterEach, describe, expect, it } from 'vitest';
import type { CtxConfig } from '../ctx-builder';
import { buildCtx } from '../ctx-builder';

const STUB_RAW = {
  request: new Request('http://localhost'),
  method: 'GET',
  url: 'http://localhost',
  headers: new Headers(),
};

function createConfig(overrides: Partial<CtxConfig> = {}): CtxConfig {
  return {
    params: {},
    body: undefined,
    query: {},
    headers: {},
    raw: STUB_RAW,
    middlewareState: {},
    services: {},
    options: {},
    env: {},
    ...overrides,
  };
}

describe('buildCtx', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('combines request data, middleware contributions, and services into flat ctx', () => {
    const ctx = buildCtx(
      createConfig({
        params: { id: '123' },
        body: { name: 'Jane' },
        query: { page: '1' },
        headers: { authorization: 'Bearer token' },
        middlewareState: { user: { id: '1', role: 'admin' } },
        services: { userService: { findById: () => {} } },
        options: { maxRetries: 3 },
        env: { DATABASE_URL: 'postgres://localhost' },
      }),
    );

    expect(ctx.params).toEqual({ id: '123' });
    expect(ctx.body).toEqual({ name: 'Jane' });
    expect(ctx.query).toEqual({ page: '1' });
    expect(ctx.headers).toEqual({ authorization: 'Bearer token' });
    expect(ctx.raw).toBeDefined();
    expect(ctx.user).toEqual({ id: '1', role: 'admin' });
    expect(ctx.userService).toBeDefined();
    expect(ctx.options).toEqual({ maxRetries: 3 });
    expect(ctx.env).toEqual({ DATABASE_URL: 'postgres://localhost' });
  });

  it('returns an immutable object in development mode', () => {
    process.env.NODE_ENV = 'development';

    const ctx = buildCtx(createConfig());

    expect(() => {
      (ctx as Record<string, unknown>).params = 'mutated';
    }).toThrow();
  });

  it('flattens middleware contributions directly onto ctx', () => {
    const ctx = buildCtx(
      createConfig({
        middlewareState: {
          user: { id: '1' },
          requestId: 'abc-123',
        },
      }),
    );

    expect(ctx.user).toEqual({ id: '1' });
    expect(ctx.requestId).toBe('abc-123');
  });

  it('throws in development mode when middleware provides a reserved key', () => {
    process.env.NODE_ENV = 'development';

    expect(() =>
      buildCtx(
        createConfig({
          params: { id: '1' },
          middlewareState: { params: { id: 'overwritten' } },
        }),
      ),
    ).toThrow('params');
  });

  it('throws in development mode when service name collides with reserved key', () => {
    process.env.NODE_ENV = 'development';

    expect(() =>
      buildCtx(
        createConfig({
          services: { body: { parse: () => {} } },
        }),
      ),
    ).toThrow('body');
  });

  it('throws in development mode when service name collides with middleware key', () => {
    process.env.NODE_ENV = 'development';

    expect(() =>
      buildCtx(
        createConfig({
          middlewareState: { user: { id: '1' } },
          services: { user: { findById: () => {} } },
        }),
      ),
    ).toThrow('user');
  });
});
