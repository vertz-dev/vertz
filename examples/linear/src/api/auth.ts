import { defineAuth, github } from '@vertz/server';
import { access } from './access';
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

  // Access config — enables RBAC, entitlements, and role assignments.
  // Combined with a .tenant() table in the schema, this auto-enables
  // tenant endpoints (/auth/tenants, /auth/switch-tenant) with
  // membership derived from role assignments. No manual tenant config needed.
  // roleStore and closureStore are auto-wired by createServer() from the DB.
  access: {
    definition: access,
  },

  // Bridge auth → entity: populate the developer's users table from GitHub profile.
  // Also handles email/password signups (for dev/E2E testing).
  // Assigns 'member' role on seed workspace via framework API (no workspaceId column).
  onUserCreated: async (payload, ctx) => {
    if (payload.provider) {
      const profile = payload.profile as Record<string, unknown>;
      await ctx.entities.users.create({
        id: payload.user.id,
        email: payload.user.email,
        name: (profile.name as string) ?? (profile.login as string),
        avatarUrl: profile.avatar_url as string,
      });
    } else {
      await ctx.entities.users.create({
        id: payload.user.id,
        email: payload.user.email,
        name: payload.user.email.split('@')[0],
        avatarUrl: null,
      });
    }

    // Assign 'member' role on seed workspace via framework's role store
    await ctx.roles!.assign(payload.user.id, 'workspace', SEED_WORKSPACE_ID, 'member');
  },
});
