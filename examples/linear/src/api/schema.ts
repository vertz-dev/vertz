import { d } from '@vertz/db';

// ---------------------------------------------------------------------------
// Users — developer-owned table, populated via onUserCreated callback
// ---------------------------------------------------------------------------

export const usersTable = d.table('users', {
  id: d.text().primary(),
  name: d.text(),
  email: d.text().unique(),
  avatarUrl: d.text().nullable(),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate().readOnly(),
});

export const usersModel = d.model(usersTable);
