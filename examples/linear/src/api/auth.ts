import { defineAuth, github } from '@vertz/server';
import { SEED_WORKSPACE_ID } from './schema';

const APP_URL = process.env.APP_URL ?? 'http://localhost:3001';

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

  // Tenant switching — enables POST /api/auth/switch-tenant.
  // In a real app verifyMembership would check a workspace_members table.
  // Here we auto-assign every user to the default seed workspace.
  tenant: {
    verifyMembership: async (_userId, tenantId) => {
      return tenantId === SEED_WORKSPACE_ID;
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
