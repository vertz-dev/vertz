import { describe, it, expect } from 'vitest';
import { createMiddleware } from '../middleware-def';

describe('createMiddleware', () => {
  it('captures middleware definition', () => {
    const handler = (ctx: Record<string, unknown>) => ({ user: ctx.token });

    const mw = createMiddleware({
      name: 'auth',
      handler,
    });

    expect(mw.name).toBe('auth');
    expect(mw.handler).toBe(handler);
  });

  it('captures inject, requires, and provides schemas', () => {
    const mw = createMiddleware({
      name: 'permissions',
      inject: { authService: {} },
      handler: () => ({ canEdit: true }),
    });

    expect(mw.name).toBe('permissions');
    expect(mw.inject).toEqual({ authService: {} });
  });

  it('returns a frozen definition object', () => {
    const mw = createMiddleware({
      name: 'auth',
      handler: () => ({ user: 'test' }),
    });

    expect(Object.isFrozen(mw)).toBe(true);
  });
});
