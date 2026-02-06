import { describe, it, expect, afterEach } from 'vitest';
import { buildCtx } from '../ctx-builder';

describe('buildCtx', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('combines request data, middleware contributions, and services into flat ctx', () => {
    const ctx = buildCtx({
      params: { id: '123' },
      body: { name: 'Jane' },
      query: { page: '1' },
      headers: { authorization: 'Bearer token' },
      raw: { request: new Request('http://localhost'), method: 'GET', url: 'http://localhost', headers: new Headers() },
      middlewareState: { user: { id: '1', role: 'admin' } },
      services: { userService: { findById: () => {} } },
      options: { maxRetries: 3 },
      env: { DATABASE_URL: 'postgres://localhost' },
    });

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

    const ctx = buildCtx({
      params: {},
      body: undefined,
      query: {},
      headers: {},
      raw: { request: new Request('http://localhost'), method: 'GET', url: 'http://localhost', headers: new Headers() },
      middlewareState: {},
      services: {},
      options: {},
      env: {},
    });

    expect(() => {
      (ctx as any).params = 'mutated';
    }).toThrow();
  });

  it('flattens middleware contributions directly onto ctx', () => {
    const ctx = buildCtx({
      params: {},
      body: undefined,
      query: {},
      headers: {},
      raw: { request: new Request('http://localhost'), method: 'GET', url: 'http://localhost', headers: new Headers() },
      middlewareState: {
        user: { id: '1' },
        requestId: 'abc-123',
      },
      services: {},
      options: {},
      env: {},
    });

    expect(ctx.user).toEqual({ id: '1' });
    expect(ctx.requestId).toBe('abc-123');
  });
});
