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
  updatedAt: d.timestamp().autoUpdate(),
});

export const usersModel = d.model(usersTable);

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projectsTable = d.table('projects', {
  id: d.uuid().primary({ generate: 'uuid' }),
  name: d.text(),
  key: d.text().unique(),
  description: d.text().nullable(),
  createdBy: d.text().default(''),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

export const projectsModel = d.model(projectsTable);
