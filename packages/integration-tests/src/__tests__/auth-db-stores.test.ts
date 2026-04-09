/**
 * Integration test — DB-Backed Auth Stores [#1059]
 *
 * Validates the full DB store lifecycle end-to-end:
 * - All DB-backed stores work with SQLite via createDb()
 * - DbUserStore: sign-up persists, findByEmail case-insensitive
 * - DbSessionStore: sessions persist with current_tokens as JSON
 * - DbRoleAssignmentStore: role assignments persist with effective role resolution
 * - DbClosureStore: closure table hierarchy queries work
 * - DbFlagStore: flags persist with in-memory cache + write-through
 * - DbSubscriptionStore: plan assignments + overrides persist via auth_plans + auth_overrides
 * - DbOAuthAccountStore: OAuth links persist with UNIQUE constraint dedup
 *
 * Uses public package imports only (@vertz/server, @vertz/db).
 */
import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { createDb, type DatabaseClient, type ModelEntry } from '@vertz/db';
import {
  authModels,
  DbClosureStore,
  DbFlagStore,
  DbOAuthAccountStore,
  DbRoleAssignmentStore,
  DbSessionStore,
  DbSubscriptionStore,
  DbUserStore,
  defineAccess,
  InMemoryClosureStore,
  initializeAuthTables,
  validateAuthModels,
} from '@vertz/server';

// ============================================================================
// Test DB Helper (inline — integration tests use public imports only)
// ============================================================================

/** Minimal D1 stub — _queryFn takes priority */
function dummyD1() {
  return {
    prepare: () => {
      throw new Error('D1 stub: should not be called when _queryFn is provided');
    },
  } as unknown as import('@vertz/db').D1Database;
}

async function createTestDb() {
  const rawDb = new Database(':memory:');

  const queryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
    const sqliteSql = sqlStr.replace(/\$\d+/g, '?');
    const trimmed = sqliteSql.trim();
    const isSelect = /^\s*SELECT/i.test(trimmed);
    const hasReturning = /RETURNING/i.test(trimmed);

    if (isSelect || hasReturning) {
      const stmt = rawDb.prepare(sqliteSql);
      const rows = stmt.all(...(params as unknown[])) as T[];
      return { rows, rowCount: rows.length };
    }

    const stmt = rawDb.prepare(sqliteSql);
    const info = stmt.run(...(params as unknown[]));
    return { rows: [] as T[], rowCount: info.changes };
  };

  const db = createDb({
    models: { ...authModels },
    dialect: 'sqlite',
    d1: dummyD1(),
    _queryFn: queryFn,
  });

  await initializeAuthTables(db);

  return { db, rawDb };
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('DB-Backed Auth Stores Integration', () => {
  let db: DatabaseClient<Record<string, ModelEntry>>;
  let rawDb: InstanceType<typeof Database>;

  beforeEach(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    rawDb = testDb.rawDb;
  });

  afterEach(() => {
    rawDb.close();
  });

  it('validates auth models are present in DatabaseClient', () => {
    // Should not throw when all auth models are present
    expect(() => validateAuthModels(db)).not.toThrow();
  });

  it('DbUserStore persists users and supports case-insensitive email lookup', async () => {
    const userStore = new DbUserStore(db);
    const user = {
      id: 'user-1',
      email: 'Test@Example.com',
      role: 'user',
      emailVerified: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };

    await userStore.createUser(user, 'hashed-pw');

    // Find by email (case-insensitive)
    const found = await userStore.findByEmail('test@example.com');
    expect(found).not.toBeNull();
    expect(found?.user.id).toBe('user-1');
    expect(found?.passwordHash).toBe('hashed-pw');

    // Find by ID
    const byId = await userStore.findById('user-1');
    expect(byId).not.toBeNull();
    expect(byId?.email).toBe('test@example.com');

    // Update email verified
    await userStore.updateEmailVerified('user-1', true);
    const updated = await userStore.findById('user-1');
    expect(updated?.emailVerified).toBe(true);
  });

  it('DbSessionStore persists sessions with current_tokens as JSON', async () => {
    const sessionStore = new DbSessionStore(db);

    const session = await sessionStore.createSessionWithId('sess-1', {
      userId: 'user-1',
      refreshTokenHash: 'hash-abc',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      expiresAt: new Date(Date.now() + 86400000), // +1 day
      currentTokens: { jwt: 'jwt-token', refreshToken: 'refresh-token' },
    });

    expect(session.id).toBe('sess-1');
    expect(session.userId).toBe('user-1');

    // Find by refresh hash
    const found = await sessionStore.findByRefreshHash('hash-abc');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('sess-1');

    // Get current tokens (stored as JSON)
    const tokens = await sessionStore.getCurrentTokens('sess-1');
    expect(tokens).not.toBeNull();
    expect(tokens?.jwt).toBe('jwt-token');

    // Count active sessions
    const count = await sessionStore.countActiveSessions('user-1');
    expect(count).toBe(1);

    // Revoke and verify
    await sessionStore.revokeSession('sess-1');
    const revoked = await sessionStore.findByRefreshHash('hash-abc');
    expect(revoked).toBeNull();

    sessionStore.dispose();
  });

  it('DbRoleAssignmentStore persists role assignments and resolves effective roles', async () => {
    const accessDef = defineAccess({
      entities: {
        organization: { roles: ['owner', 'admin', 'member'] },
        project: {
          roles: ['manager', 'contributor', 'viewer'],
          inherits: {
            'organization:owner': 'manager',
            'organization:admin': 'contributor',
            'organization:member': 'viewer',
          },
        },
      },
      entitlements: {},
    });

    const roleStore = new DbRoleAssignmentStore(db);
    const closureStore = new InMemoryClosureStore();

    // Set up hierarchy
    await closureStore.addResource('organization', 'org-1');
    await closureStore.addResource('project', 'proj-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });

    // Assign org-level role
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');

    // Direct role check
    const orgRoles = await roleStore.getRoles('user-1', 'organization', 'org-1');
    expect(orgRoles).toContain('admin');

    // Effective role via inheritance
    const effectiveRole = await roleStore.getEffectiveRole(
      'user-1',
      'project',
      'proj-1',
      accessDef,
      closureStore,
    );
    expect(effectiveRole).toBe('contributor');

    roleStore.dispose();
    closureStore.dispose();
  });

  it('DbClosureStore persists hierarchy and supports ancestor/descendant queries', async () => {
    const closureStore = new DbClosureStore(db);

    await closureStore.addResource('org', 'org-1');
    await closureStore.addResource('team', 'team-1', {
      parentType: 'org',
      parentId: 'org-1',
    });
    await closureStore.addResource('project', 'proj-1', {
      parentType: 'team',
      parentId: 'team-1',
    });

    // Ancestors of project should include team and org
    const ancestors = await closureStore.getAncestors('project', 'proj-1');
    expect(ancestors.length).toBeGreaterThanOrEqual(3);
    expect(ancestors.some((a) => a.type === 'org' && a.id === 'org-1')).toBe(true);
    expect(ancestors.some((a) => a.type === 'team' && a.id === 'team-1')).toBe(true);

    // Descendants of org should include team and project
    const descendants = await closureStore.getDescendants('org', 'org-1');
    expect(descendants.some((d) => d.type === 'project' && d.id === 'proj-1')).toBe(true);

    // Path check
    expect(await closureStore.hasPath('org', 'org-1', 'project', 'proj-1')).toBe(true);
    expect(await closureStore.hasPath('project', 'proj-1', 'org', 'org-1')).toBe(false);

    closureStore.dispose();
  });

  it('DbFlagStore persists flags with in-memory cache', async () => {
    const flagStore = new DbFlagStore(db);

    // Set flags
    flagStore.setFlag('tenant', 'org-1', 'beta_feature', true);
    flagStore.setFlag('tenant', 'org-1', 'new_ui', false);

    // Read from cache (synchronous)
    expect(flagStore.getFlag('tenant', 'org-1', 'beta_feature')).toBe(true);
    expect(flagStore.getFlag('tenant', 'org-1', 'new_ui')).toBe(false);
    expect(flagStore.getFlag('tenant', 'org-1', 'nonexistent')).toBe(false);

    // Simulate restart by creating new store and loading from DB
    // Wait a tick for fire-and-forget writes to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    const flagStore2 = new DbFlagStore(db);
    await flagStore2.loadFlags();

    expect(flagStore2.getFlag('tenant', 'org-1', 'beta_feature')).toBe(true);
    expect(flagStore2.getFlag('tenant', 'org-1', 'new_ui')).toBe(false);
  });

  it('DbSubscriptionStore persists plans and overrides across tables', async () => {
    const subscriptionStore = new DbSubscriptionStore(db);

    // Assign plan
    const startedAt = new Date('2026-01-01T00:00:00Z');
    await subscriptionStore.assign('tenant', 'org-1', 'pro', startedAt);

    const plan = await subscriptionStore.get('tenant', 'org-1');
    expect(plan).not.toBeNull();
    expect(plan?.planId).toBe('pro');
    expect(plan?.startedAt.getTime()).toBe(startedAt.getTime());
    expect(plan?.overrides).toEqual({});

    // Add overrides
    await subscriptionStore.updateOverrides('tenant', 'org-1', {
      'project:create': { max: 500 },
    });

    const planWithOverrides = await subscriptionStore.get('tenant', 'org-1');
    expect(planWithOverrides?.overrides).toEqual({
      'project:create': { max: 500 },
    });

    // Reassign plan — overrides reset
    await subscriptionStore.assign('tenant', 'org-1', 'enterprise');
    const newPlan = await subscriptionStore.get('tenant', 'org-1');
    expect(newPlan?.planId).toBe('enterprise');
    expect(newPlan?.overrides).toEqual({});

    subscriptionStore.dispose();
  });

  it('DbOAuthAccountStore persists OAuth links with dedup', async () => {
    const oauthStore = new DbOAuthAccountStore(db);

    // Link accounts
    await oauthStore.linkAccount('user-1', 'github', 'gh-123', 'user@example.com');
    await oauthStore.linkAccount('user-1', 'google', 'goog-456');

    // Find by provider
    const userId = await oauthStore.findByProviderAccount('github', 'gh-123');
    expect(userId).toBe('user-1');

    // Find by user
    const accounts = await oauthStore.findByUserId('user-1');
    expect(accounts).toHaveLength(2);

    // Idempotent link
    await oauthStore.linkAccount('user-1', 'github', 'gh-123');
    const accounts2 = await oauthStore.findByUserId('user-1');
    expect(accounts2).toHaveLength(2);

    // Unlink
    await oauthStore.unlinkAccount('user-1', 'github');
    expect(await oauthStore.findByProviderAccount('github', 'gh-123')).toBeNull();
    expect(await oauthStore.findByUserId('user-1')).toHaveLength(1);

    oauthStore.dispose();
  });

  it('all stores work together in a realistic scenario', async () => {
    const accessDef = defineAccess({
      entities: {
        organization: { roles: ['owner', 'admin', 'member'] },
        project: {
          roles: ['manager', 'contributor', 'viewer'],
          inherits: {
            'organization:owner': 'manager',
            'organization:admin': 'contributor',
            'organization:member': 'viewer',
          },
        },
      },
      entitlements: {
        'project:create': { roles: ['manager', 'contributor'] },
        'project:view': { roles: ['viewer', 'contributor', 'manager'] },
      },
      plans: {
        free: {
          group: 'main',
          features: ['project:create', 'project:view'],
          limits: {
            projects: { max: 5, gates: 'project:create', per: 'month' },
          },
        },
        pro: {
          group: 'main',
          features: ['project:create', 'project:view'],
          limits: {
            projects: { max: 100, gates: 'project:create', per: 'month' },
          },
        },
      },
    });

    const roleStore = new DbRoleAssignmentStore(db);
    const closureStore = new DbClosureStore(db);
    const flagStore = new DbFlagStore(db);
    const subscriptionStore = new DbSubscriptionStore(db);
    const oauthStore = new DbOAuthAccountStore(db);

    // 1. Set up org hierarchy
    await closureStore.addResource('organization', 'org-1');
    await closureStore.addResource('project', 'proj-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });

    // 2. Assign roles
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');

    // 3. Assign plan
    await subscriptionStore.assign('tenant', 'org-1', 'pro');

    // 4. Set feature flags
    flagStore.setFlag('tenant', 'org-1', 'advanced_analytics', true);

    // 5. Link OAuth account
    await oauthStore.linkAccount('user-1', 'github', 'gh-789');

    // Verify all stores have correct data
    const effectiveRole = await roleStore.getEffectiveRole(
      'user-1',
      'project',
      'proj-1',
      accessDef,
      closureStore,
    );
    expect(effectiveRole).toBe('contributor');

    const plan = await subscriptionStore.get('tenant', 'org-1');
    expect(plan?.planId).toBe('pro');

    expect(flagStore.getFlag('tenant', 'org-1', 'advanced_analytics')).toBe(true);

    const linkedAccounts = await oauthStore.findByUserId('user-1');
    expect(linkedAccounts).toHaveLength(1);
    expect(linkedAccounts[0]?.provider).toBe('github');

    // Cleanup
    roleStore.dispose();
    closureStore.dispose();
    subscriptionStore.dispose();
    oauthStore.dispose();
  });
});
