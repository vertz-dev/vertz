import { d } from '@vertz/db';

// Default workspace ID — all seed data and new signups belong to this workspace.
export const SEED_WORKSPACE_ID = 'ws-acme';

// ---------------------------------------------------------------------------
// Workspaces — tenant root table for multi-tenancy scoping.
// In Linear, the top-level organizational unit is a Workspace.
// ---------------------------------------------------------------------------

export const workspacesTable = d.table('workspaces', {
  id: d.text().primary(),
  name: d.text(),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

export const workspacesModel = d.model(workspacesTable);

// ---------------------------------------------------------------------------
// Users — developer-owned table, populated via onUserCreated callback
// ---------------------------------------------------------------------------

export const usersTable = d.table('users', {
  id: d.text().primary(),
  workspaceId: d.text().default(''),
  name: d.text(),
  email: d.text().unique(),
  avatarUrl: d.text().nullable(),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

export const usersModel = d.model(
  usersTable,
  {
    workspace: d.ref.one(() => workspacesTable, 'workspaceId'),
  },
  { tenant: 'workspace' },
);

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projectsTable = d.table('projects', {
  id: d.uuid().primary({ generate: 'uuid' }),
  workspaceId: d.text().default(''),
  name: d.text(),
  key: d.text().unique(),
  description: d.text().nullable(),
  createdBy: d.text().default(''),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

export const projectsModel = d.model(
  projectsTable,
  {
    workspace: d.ref.one(() => workspacesTable, 'workspaceId'),
    creator: d.ref.one(() => usersTable, 'createdBy'),
  },
  { tenant: 'workspace' },
);

// ---------------------------------------------------------------------------
// Issues — indirectly scoped via project → workspace
// ---------------------------------------------------------------------------

export const issuesTable = d.table('issues', {
  id: d.uuid().primary({ generate: 'uuid' }),
  workspaceId: d.text().default(''),
  projectId: d.uuid(),
  number: d.integer().default(0),
  title: d.text(),
  description: d.text().nullable(),
  status: d.text().default('backlog'),
  priority: d.text().default('none'),
  assigneeId: d.text().nullable(),
  createdBy: d.text().default(''),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

export const issuesModel = d.model(issuesTable, {
  project: d.ref.one(() => projectsTable, 'projectId'),
  assignee: d.ref.one(() => usersTable, 'assigneeId'),
});

// ---------------------------------------------------------------------------
// Labels — per-project categorization for issues
// ---------------------------------------------------------------------------

export const labelsTable = d.table('labels', {
  id: d.uuid().primary({ generate: 'uuid' }),
  workspaceId: d.text().default(''),
  projectId: d.uuid(),
  name: d.text(),
  color: d.text(),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

export const labelsModel = d.model(labelsTable, {
  project: d.ref.one(() => projectsTable, 'projectId'),
});

// ---------------------------------------------------------------------------
// Issue Labels — join table for many-to-many (issues ↔ labels)
// ---------------------------------------------------------------------------

export const issueLabelsTable = d.table('issue_labels', {
  id: d.uuid().primary({ generate: 'uuid' }),
  workspaceId: d.text().default(''),
  issueId: d.uuid(),
  labelId: d.uuid(),
  createdAt: d.timestamp().default('now').readOnly(),
});

export const issueLabelsModel = d.model(issueLabelsTable, {
  issue: d.ref.one(() => issuesTable, 'issueId'),
  label: d.ref.one(() => labelsTable, 'labelId'),
});

// ---------------------------------------------------------------------------
// Comments — indirectly scoped via issue → project → workspace
// ---------------------------------------------------------------------------

export const commentsTable = d.table('comments', {
  id: d.uuid().primary({ generate: 'uuid' }),
  workspaceId: d.text().default(''),
  issueId: d.uuid(),
  body: d.text(),
  authorId: d.text().default(''),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

export const commentsModel = d.model(commentsTable, {
  issue: d.ref.one(() => issuesTable, 'issueId'),
  author: d.ref.one(() => usersTable, 'authorId'),
});
