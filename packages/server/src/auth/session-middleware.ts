import { createMiddleware } from '@vertz/core';
import type { AuthApi } from './types';

/**
 * Creates a middleware that bridges auth session data into the request context.
 *
 * Auth's `getSession()` resolves the JWT from cookies and returns user/session data.
 * This middleware maps that data to the context fields that entity and service
 * handlers expect: `ctx.userId`, `ctx.tenantId`, `ctx.roles`.
 *
 * Registered automatically by `createServer()` when both `db` and `auth` are provided.
 */
export function createAuthSessionMiddleware(api: AuthApi) {
  return createMiddleware({
    name: 'vertz-auth-session',
    handler: async (ctx: Record<string, unknown>) => {
      const raw = ctx.raw as { headers?: Headers } | undefined;
      if (!raw?.headers) return {};

      const result = await api.getSession(raw.headers);
      if (!result.ok || !result.data) return {};

      return {
        userId: result.data.user.id,
        tenantId: result.data.payload.tenantId ?? null,
        roles: [result.data.user.role],
        user: result.data.user,
        session: result.data,
      };
    },
  });
}
