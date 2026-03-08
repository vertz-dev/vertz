/**
 * OAuth accounts table definition for future DB backend.
 * Uses @vertz/db schema builder.
 * InMemoryOAuthAccountStore remains the runtime default for Phase 3.
 */

import { d } from '@vertz/db';

export const oauthAccountsTable = d.table('oauth_accounts', {
  id: d.uuid().primary({ generate: 'uuid' }),
  userId: d.uuid(),
  provider: d.text(),
  providerId: d.text(),
  email: d.text().nullable(),
  createdAt: d.timestamp().default('now').readOnly(),
});
