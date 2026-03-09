/**
 * Auth model definitions for use with createDb().
 *
 * Pre-built table schemas for all auth tables. Users spread these
 * into their createDb() call:
 *
 *   createDb({ models: { ...authModels, ...myModels } })
 */

import type { ModelDef } from '@vertz/db';
import { d } from '@vertz/db';

// ---------------------------------------------------------------------------
// Table definitions
// ---------------------------------------------------------------------------

const authUsersTable = d.table('auth_users', {
  id: d.text().primary(),
  email: d.text(),
  passwordHash: d.text().nullable(),
  role: d.text().default('user'),
  plan: d.text().nullable(),
  emailVerified: d.boolean().default(false),
  createdAt: d.timestamp().default('now'),
  updatedAt: d.timestamp().default('now'),
});

const authSessionsTable = d.table('auth_sessions', {
  id: d.text().primary(),
  userId: d.text(),
  refreshTokenHash: d.text(),
  previousRefreshHash: d.text().nullable(),
  currentTokens: d.text().nullable(),
  ipAddress: d.text(),
  userAgent: d.text(),
  createdAt: d.timestamp().default('now'),
  lastActiveAt: d.timestamp().default('now'),
  expiresAt: d.timestamp(),
  revokedAt: d.timestamp().nullable(),
});

const authOauthAccountsTable = d.table('auth_oauth_accounts', {
  id: d.text().primary(),
  userId: d.text(),
  provider: d.text(),
  providerId: d.text(),
  email: d.text().nullable(),
  createdAt: d.timestamp().default('now'),
});

const authRoleAssignmentsTable = d.table('auth_role_assignments', {
  id: d.text().primary(),
  userId: d.text(),
  resourceType: d.text(),
  resourceId: d.text(),
  role: d.text(),
  createdAt: d.timestamp().default('now'),
});

const authClosureTable = d.table('auth_closure', {
  id: d.text().primary(),
  ancestorType: d.text(),
  ancestorId: d.text(),
  descendantType: d.text(),
  descendantId: d.text(),
  depth: d.integer(),
});

const authPlansTable = d.table('auth_plans', {
  id: d.text().primary(),
  tenantId: d.text(),
  planId: d.text(),
  startedAt: d.timestamp().default('now'),
  expiresAt: d.timestamp().nullable(),
});

const authPlanAddonsTable = d.table('auth_plan_addons', {
  id: d.text().primary(),
  tenantId: d.text(),
  addonId: d.text(),
  isOneOff: d.boolean().default(false),
  quantity: d.integer().default(1),
  createdAt: d.timestamp().default('now'),
});

const authFlagsTable = d.table('auth_flags', {
  id: d.text().primary(),
  tenantId: d.text(),
  flag: d.text(),
  enabled: d.boolean().default(false),
});

const authOverridesTable = d.table('auth_overrides', {
  id: d.text().primary(),
  tenantId: d.text(),
  overrides: d.text(),
  updatedAt: d.timestamp().default('now'),
});

// ---------------------------------------------------------------------------
// Auth models — spread into createDb({ models: { ...authModels } })
// ---------------------------------------------------------------------------

export const authModels: {
  auth_users: ModelDef<typeof authUsersTable>;
  auth_sessions: ModelDef<typeof authSessionsTable>;
  auth_oauth_accounts: ModelDef<typeof authOauthAccountsTable>;
  auth_role_assignments: ModelDef<typeof authRoleAssignmentsTable>;
  auth_closure: ModelDef<typeof authClosureTable>;
  auth_plans: ModelDef<typeof authPlansTable>;
  auth_plan_addons: ModelDef<typeof authPlanAddonsTable>;
  auth_flags: ModelDef<typeof authFlagsTable>;
  auth_overrides: ModelDef<typeof authOverridesTable>;
} = {
  auth_users: d.model(authUsersTable),
  auth_sessions: d.model(authSessionsTable),
  auth_oauth_accounts: d.model(authOauthAccountsTable),
  auth_role_assignments: d.model(authRoleAssignmentsTable),
  auth_closure: d.model(authClosureTable),
  auth_plans: d.model(authPlansTable),
  auth_plan_addons: d.model(authPlanAddonsTable),
  auth_flags: d.model(authFlagsTable),
  auth_overrides: d.model(authOverridesTable),
};
