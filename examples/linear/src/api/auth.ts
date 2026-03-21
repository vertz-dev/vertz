import { sql } from '@vertz/db/sql';
import { defineAuth, github } from '@vertz/server';
import { db } from './db';
import { SEED_WORKSPACE_ID } from './schema';

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

export const auth = defineAuth({
  session: { strategy: 'jwt', ttl: '15m', refreshTtl: '7d', cookie: { secure: false } },
  emailPassword: {},
  providers: [
    github({
      clientId: process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
      redirectUrl: `${APP_URL}/api/auth/oauth/github/callback`,
    }),
  ],
  oauthEncryptionKey: process.env.OAUTH_ENCRYPTION_KEY,
  oauthSuccessRedirect: '/projects',
  oauthErrorRedirect: '/login',

  // Tenant switching — enables POST /api/auth/switch-tenant and GET /api/auth/tenants.
  // Queries the database to verify membership and list workspaces.
  // resolveDefault is omitted — the built-in strategy uses lastTenantId (persisted
  // in auth_users during switch-tenant) with fallback to the first tenant in the list.
  tenant: {
    verifyMembership: async (userId, tenantId) => {
      const result = await db.query<{ id: string }>(
        sql`SELECT id FROM users WHERE id = ${userId} AND workspace_id = ${tenantId} LIMIT 1`,
      );
      return result.ok && result.data.rows.length > 0;
    },
    listTenants: async (userId) => {
      const result = await db.query<{ id: string; name: string }>(
        sql`SELECT w.id, w.name FROM workspaces w
            INNER JOIN users u ON u.workspace_id = w.id
            WHERE u.id = ${userId}`,
      );
      if (!result.ok) return [];
      return result.data.rows.map((row) => ({ id: row.id, name: row.name }));
    },
  },

  // Bridge auth → entity: populate the developer's users table from GitHub profile.
  // Also handles email/password signups (for dev/E2E testing).
  // workspaceId is set explicitly because the session has no tenant yet at signup time.
  onUserCreated: async (payload, ctx) => {
    if (payload.provider) {
      const profile = payload.profile as Record<string, unknown>;
      await ctx.entities.users.create({
        id: payload.user.id,
        workspaceId: SEED_WORKSPACE_ID,
        email: payload.user.email,
        name: (profile.name as string) ?? (profile.login as string),
        avatarUrl: profile.avatar_url as string,
      });
    } else {
      await ctx.entities.users.create({
        id: payload.user.id,
        workspaceId: SEED_WORKSPACE_ID,
        email: payload.user.email,
        name: payload.user.email.split('@')[0],
        avatarUrl: null,
      });
    }
  },
});
