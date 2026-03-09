/**
 * Sessions table definition for future DB backend.
 * Uses @vertz/db schema builder.
 * InMemorySessionStore remains the runtime default for Phase 2.
 */

import { d } from '@vertz/db';

export const sessionsTable = d.table('sessions', {
  id: d.uuid().primary(),
  userId: d.uuid(),
  refreshTokenHash: d.text(),
  previousRefreshHash: d.text().nullable(),
  ipAddress: d.text(),
  userAgent: d.text(),
  createdAt: d.timestamp().default('now').readOnly(),
  lastActiveAt: d.timestamp().default('now'),
  expiresAt: d.timestamp(),
  revokedAt: d.timestamp().nullable(),
});
