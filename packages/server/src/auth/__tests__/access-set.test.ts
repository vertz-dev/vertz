import { describe, expect, it } from 'bun:test';
import { computeAccessSet, decodeAccessSet, encodeAccessSet } from '../access-set';
import { InMemoryClosureStore } from '../closure-store';
import { defineAccess } from '../define-access';
import { InMemoryRoleAssignmentStore } from '../role-assignment-store';

const accessDef = defineAccess({
  hierarchy: ['Organization', 'Team', 'Project'],
  roles: {
    Organization: ['owner', 'admin', 'member'],
    Team: ['lead', 'editor', 'viewer'],
    Project: ['manager', 'contributor', 'viewer'],
  },
  inheritance: {
    Organization: { owner: 'lead', admin: 'editor', member: 'viewer' },
    Team: { lead: 'manager', editor: 'contributor', viewer: 'viewer' },
  },
  entitlements: {
    'project:create': { roles: ['admin', 'owner'] },
    'project:view': { roles: ['viewer', 'contributor', 'manager'] },
    'project:edit': { roles: ['contributor', 'manager'] },
    'project:delete': { roles: ['manager'] },
    'app:use': { roles: [] },
  },
});

function createStores() {
  const roleStore = new InMemoryRoleAssignmentStore();
  const closureStore = new InMemoryClosureStore();
  return { roleStore, closureStore };
}

describe('computeAccessSet', () => {
  it('returns allowed for user with admin role on an org', async () => {
    const { roleStore, closureStore } = createStores();
    closureStore.addResource('Organization', 'org-1');
    roleStore.assign('user-1', 'Organization', 'org-1', 'admin');

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
    });

    expect(result.entitlements['project:create'].allowed).toBe(true);
  });

  it('returns denied for unauthenticated user (null userId)', async () => {
    const { roleStore, closureStore } = createStores();

    const result = await computeAccessSet({
      userId: null,
      accessDef,
      roleStore,
      closureStore,
    });

    for (const [, check] of Object.entries(result.entitlements)) {
      expect(check.allowed).toBe(false);
      expect(check.reasons).toContain('not_authenticated');
    }
  });

  it('resolves inherited roles (owner on Org -> contributor on Project)', async () => {
    const { roleStore, closureStore } = createStores();
    closureStore.addResource('Organization', 'org-1');
    closureStore.addResource('Team', 'team-1', {
      parentType: 'Organization',
      parentId: 'org-1',
    });
    closureStore.addResource('Project', 'proj-1', {
      parentType: 'Team',
      parentId: 'team-1',
    });
    roleStore.assign('user-1', 'Organization', 'org-1', 'owner');

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
    });

    // owner -> lead -> manager, so project:delete (requires manager) should be allowed
    expect(result.entitlements['project:delete'].allowed).toBe(true);
    expect(result.entitlements['project:view'].allowed).toBe(true);
    expect(result.entitlements['project:create'].allowed).toBe(true);
  });

  it('handles user with partial entitlements (some allowed, some denied)', async () => {
    const { roleStore, closureStore } = createStores();
    closureStore.addResource('Organization', 'org-1');
    closureStore.addResource('Team', 'team-1', {
      parentType: 'Organization',
      parentId: 'org-1',
    });
    closureStore.addResource('Project', 'proj-1', {
      parentType: 'Team',
      parentId: 'team-1',
    });
    // member -> viewer (Team) -> viewer (Project)
    roleStore.assign('user-1', 'Organization', 'org-1', 'member');

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
    });

    expect(result.entitlements['project:view'].allowed).toBe(true);
    expect(result.entitlements['project:edit'].allowed).toBe(false);
    expect(result.entitlements['project:delete'].allowed).toBe(false);
    expect(result.entitlements['project:create'].allowed).toBe(false);
  });

  it('grants entitlements with empty roles array automatically', async () => {
    const { roleStore, closureStore } = createStores();

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
    });

    expect(result.entitlements['app:use'].allowed).toBe(true);
    expect(result.entitlements['app:use'].reasons).toEqual([]);
  });

  it('stubs flags as empty and uses config.plan', async () => {
    const { roleStore, closureStore } = createStores();

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
      plan: 'pro',
    });

    expect(result.flags).toEqual({});
    expect(result.plan).toBe('pro');
    expect(result.computedAt).toBeTruthy();
  });

  it('handles user with no role assignments', async () => {
    const { roleStore, closureStore } = createStores();

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
    });

    // All role-requiring entitlements denied, app:use granted
    expect(result.entitlements['project:create'].allowed).toBe(false);
    expect(result.entitlements['project:view'].allowed).toBe(false);
    expect(result.entitlements['app:use'].allowed).toBe(true);
  });
});

describe('encodeAccessSet', () => {
  it('produces sparse encoding (only allowed + non-empty meta)', () => {
    const set = {
      entitlements: {
        'project:view': { allowed: true, reasons: [] as string[] },
        'project:edit': { allowed: false, reasons: ['role_required'] as string[] },
        'project:delete': {
          allowed: false,
          reasons: ['role_required'] as string[],
          reason: 'role_required' as const,
          meta: { requiredRoles: ['manager'] },
        },
      },
      flags: {},
      plan: null,
      computedAt: '2026-01-01T00:00:00.000Z',
    };

    const encoded = encodeAccessSet(set);

    // Allowed entries should be present
    expect(encoded.entitlements['project:view']).toBeDefined();
    // Denied without meta should NOT be present (sparse)
    expect(encoded.entitlements['project:edit']).toBeUndefined();
    // Denied WITH meta should be present
    expect(encoded.entitlements['project:delete']).toBeDefined();
  });

  it('strips requiredRoles and requiredPlans from encoded output', () => {
    const set = {
      entitlements: {
        'project:delete': {
          allowed: false,
          reasons: ['role_required'] as string[],
          reason: 'role_required' as const,
          meta: { requiredRoles: ['manager'], requiredPlans: ['pro'] },
        },
      },
      flags: {},
      plan: 'free',
      computedAt: '2026-01-01T00:00:00.000Z',
    };

    const encoded = encodeAccessSet(set);
    const entry = encoded.entitlements['project:delete'];

    expect(entry).toBeDefined();
    expect(entry?.meta?.requiredRoles).toBeUndefined();
    expect(entry?.meta?.requiredPlans).toBeUndefined();
  });
});

describe('decodeAccessSet', () => {
  it('inflates sparse encoding to full AccessSet', () => {
    const encoded = {
      entitlements: {
        'project:view': { allowed: true, reasons: [] },
      },
      flags: {},
      plan: null,
      computedAt: '2026-01-01T00:00:00.000Z',
    };

    const decoded = decodeAccessSet(encoded, accessDef);

    expect(decoded.entitlements['project:view'].allowed).toBe(true);
    // Missing entitlements filled in as denied
    expect(decoded.entitlements['project:create'].allowed).toBe(false);
    expect(decoded.entitlements['project:create'].reasons).toContain('role_required');
  });

  it('defaults missing entitlements to denied', () => {
    const encoded = {
      entitlements: {},
      flags: {},
      plan: null,
      computedAt: '2026-01-01T00:00:00.000Z',
    };

    const decoded = decodeAccessSet(encoded, accessDef);

    for (const name of Object.keys(accessDef.entitlements)) {
      const check = decoded.entitlements[name];
      expect(check).toBeDefined();
      if (accessDef.entitlements[name].roles.length === 0) {
        // No-role entitlement defaults to denied in sparse encoding
        // (it was allowed but missing from encoded = treated as denied)
        expect(check.allowed).toBe(false);
      } else {
        expect(check.allowed).toBe(false);
        expect(check.reasons).toContain('role_required');
      }
    }
  });
});

describe('encode/decode round-trip', () => {
  it('preserves all data through round-trip', async () => {
    const { roleStore, closureStore } = createStores();
    closureStore.addResource('Organization', 'org-1');
    closureStore.addResource('Team', 'team-1', {
      parentType: 'Organization',
      parentId: 'org-1',
    });
    closureStore.addResource('Project', 'proj-1', {
      parentType: 'Team',
      parentId: 'team-1',
    });
    roleStore.assign('user-1', 'Organization', 'org-1', 'admin');

    const original = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
      plan: 'pro',
    });

    const encoded = encodeAccessSet(original);
    const decoded = decodeAccessSet(encoded, accessDef);

    // Allowed/denied status preserved
    for (const name of Object.keys(accessDef.entitlements)) {
      expect(decoded.entitlements[name].allowed).toBe(original.entitlements[name].allowed);
    }

    // Metadata preserved
    expect(decoded.plan).toBe(original.plan);
    expect(decoded.computedAt).toBe(original.computedAt);
    expect(decoded.flags).toEqual(original.flags);
  });
});
