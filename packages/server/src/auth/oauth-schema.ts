/**
 * OAuth accounts table definition for future DB backend.
 * Uses @vertz/db schema builder.
 * InMemoryOAuthAccountStore remains the runtime default for Phase 3.
 */

import { d, type TableDef } from '@vertz/db';

export const oauthAccountsTable: TableDef = d.table('oauth_accounts', {
  id: d.uuid().primary(),
  userId: d.uuid(),
  provider: d.text(),
  providerId: d.text(),
  email: d.text().nullable(),
  createdAt: d.timestamp().default('now').readOnly(),
});
