import { describe, expect, it } from '@vertz/test';
import { UnauthorizedException } from '../../exceptions';
import { type ResolvedMiddleware, runMiddlewareChain } from '../middleware-runner';

describe('runMiddlewareChain', () => {
  it('returns empty state for an empty chain', async () => {
    const result = await runMiddlewareChain([], {});

    expect(result).toEqual({});
  });

  it('accumulates contributions from a single middleware', async () => {
    const middlewares: ResolvedMiddleware[] = [
      {
        name: 'auth',
        resolvedInject: {},
        handler: () => ({ user: { id: '1', role: 'admin' } }),
      },
    ];

    const result = await runMiddlewareChain(middlewares, {});

    expect(result).toEqual({ user: { id: '1', role: 'admin' } });
  });

  it('accumulates state from multiple middlewares', async () => {
    const middlewares: ResolvedMiddleware[] = [
      {
        name: 'auth',
        resolvedInject: {},
        handler: () => ({ user: { id: '1' } }),
      },
      {
        name: 'permissions',
        resolvedInject: {},
        handler: (ctx) => {
          // Second middleware can see first middleware's contribution
          const user = ctx.user as { id: string };
          return { permissions: [`user:${user.id}:read`] };
        },
      },
    ];

    const result = await runMiddlewareChain(middlewares, {});

    expect(result).toEqual({
      user: { id: '1' },
      permissions: ['user:1:read'],
    });
  });

  it('makes injected services available on ctx', async () => {
    const mockService = { verify: (_token: string) => ({ id: '42' }) };
    const middlewares: ResolvedMiddleware[] = [
      {
        name: 'auth',
        resolvedInject: { tokenService: mockService },
        handler: (ctx) => {
          const svc = ctx.tokenService as typeof mockService;
          return { user: svc.verify('test-token') };
        },
      },
    ];

    const result = await runMiddlewareChain(middlewares, {});

    expect(result).toEqual({ user: { id: '42' } });
  });

  it('short-circuits chain when middleware throws', async () => {
    let secondCalled = false;
    const middlewares: ResolvedMiddleware[] = [
      {
        name: 'auth',
        resolvedInject: {},
        handler: () => {
          throw new UnauthorizedException('No token');
        },
      },
      {
        name: 'should-not-run',
        resolvedInject: {},
        handler: () => {
          secondCalled = true;
          return {};
        },
      },
    ];

    await expect(runMiddlewareChain(middlewares, {})).rejects.toThrow(UnauthorizedException);
    expect(secondCalled).toBe(false);
  });

  it('passes request context to middleware handlers', async () => {
    const requestCtx = {
      params: { id: '123' },
      headers: { authorization: 'Bearer token' },
    };

    const middlewares: ResolvedMiddleware[] = [
      {
        name: 'auth',
        resolvedInject: {},
        handler: (ctx) => {
          const auth = (ctx.headers as Record<string, string>).authorization;
          return { token: auth };
        },
      },
    ];

    const result = await runMiddlewareChain(middlewares, requestCtx);

    expect(result).toEqual({ token: 'Bearer token' });
  });

  it('handles async middleware handlers', async () => {
    const middlewares: ResolvedMiddleware[] = [
      {
        name: 'slow-auth',
        resolvedInject: {},
        handler: async () => {
          await new Promise((r) => setTimeout(r, 1));
          return { authenticated: true };
        },
      },
    ];

    const result = await runMiddlewareChain(middlewares, {});

    expect(result).toEqual({ authenticated: true });
  });

  it('ignores non-object contributions (arrays, primitives)', async () => {
    const middlewares: ResolvedMiddleware[] = [
      {
        name: 'returns-array',
        resolvedInject: {},
        handler: () => ['item1', 'item2'],
      },
      {
        name: 'returns-string',
        resolvedInject: {},
        handler: () => 'hello',
      },
      {
        name: 'returns-object',
        resolvedInject: {},
        handler: () => ({ valid: true }),
      },
    ];

    const result = await runMiddlewareChain(middlewares, {});

    expect(result).toEqual({ valid: true });
  });

  describe('prototype pollution prevention', () => {
    it('filters out __proto__ keys from middleware contributions', async () => {
      const middlewares: ResolvedMiddleware[] = [
        {
          name: 'malicious',
          resolvedInject: {},
          handler: () => ({ __proto__: { admin: true }, safe: 'value' }),
        },
      ];

      const result = await runMiddlewareChain(middlewares, {});

      // The safe key should be preserved
      expect(result.safe).toBe('value');
      // The __proto__ payload must NOT pollute the prototype
      expect((result as Record<string, unknown>).admin).toBeUndefined();
      // Verify Object.prototype was not polluted
      expect(({} as Record<string, unknown>).admin).toBeUndefined();
    });

    it('filters out constructor keys from middleware contributions', async () => {
      const middlewares: ResolvedMiddleware[] = [
        {
          name: 'malicious',
          resolvedInject: {},
          handler: () => ({
            constructor: { prototype: { role: 'admin' } },
            legitimate: true,
          }),
        },
      ];

      const result = await runMiddlewareChain(middlewares, {});

      // The legitimate key should be preserved
      expect(result.legitimate).toBe(true);
      // The constructor key must be filtered out
      expect(result.constructor).toBeUndefined();
    });

    it('filters out prototype keys from middleware contributions', async () => {
      const middlewares: ResolvedMiddleware[] = [
        {
          name: 'malicious',
          resolvedInject: {},
          handler: () => ({ prototype: { isAdmin: true }, data: 'ok' }),
        },
      ];

      const result = await runMiddlewareChain(middlewares, {});

      expect(result.data).toBe('ok');
      expect(result.prototype).toBeUndefined();
    });

    it('still accumulates normal keys alongside filtered dangerous keys', async () => {
      const middlewares: ResolvedMiddleware[] = [
        {
          name: 'mixed',
          resolvedInject: {},
          handler: () => ({
            __proto__: { injected: true },
            constructor: { prototype: {} },
            prototype: { bad: true },
            userId: '42',
            role: 'user',
          }),
        },
        {
          name: 'second',
          resolvedInject: {},
          handler: () => ({ permissions: ['read'] }),
        },
      ];

      const result = await runMiddlewareChain(middlewares, {});

      // Normal keys from both middlewares are accumulated
      expect(result.userId).toBe('42');
      expect(result.role).toBe('user');
      expect(result.permissions).toEqual(['read']);
      // All dangerous keys are filtered
      expect(Object.keys(result)).toEqual(['userId', 'role', 'permissions']);
    });
  });
});
