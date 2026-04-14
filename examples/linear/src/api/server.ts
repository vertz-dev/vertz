/**
 * Linear clone server — auth + entity CRUD.
 *
 * Uses createServer with both db (DatabaseClient) and auth, which auto-wires:
 * - DB-backed UserStore and SessionStore
 * - Entity registry proxy for onUserCreated callback
 */

import { createServer, github } from '@vertz/server';
import { db } from './db';
import { comments } from './entities/comments.entity';
import { issues } from './entities/issues.entity';
import { projects } from './entities/projects.entity';
import { users } from './entities/users.entity';

const APP_URL = process.env.APP_URL ?? 'http://localhost:3001';

export const app = createServer({
  basePath: '/api',
  entities: [users, projects, issues, comments],
  // biome-ignore lint/suspicious/noExplicitAny: DatabaseClient model variance
  db: db as any,
  auth: {
    session: { strategy: 'jwt', ttl: '15m', refreshTtl: '7d', cookie: { secure: false } },
    emailPassword: {},
    // Dev mode auto-generates RSA key pair — no keys needed for local development
    isProduction: false,
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

    // Bridge auth → entity: populate the developer's users table from GitHub profile.
    // Also handles email/password signups (for dev/E2E testing).
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
    },
  },
});
