/**
 * Integration test — Reactive Invalidation + Feature Flags (Phase 9) [#1023]
 *
 * Validates the full feature flag and reactive invalidation lifecycle:
 * - FlagStore interface with InMemoryFlagStore
 * - Layer 1 un-stubbing in createAccessContext()
 * - computeAccessSet() with real flag state
 * - Access event broadcaster creation and event formatting
 * - Inline flag/limit updates in client-side access set
 *
 * Uses public package imports only (@vertz/server).
 */
import { describe, expect, it } from 'bun:test';
import type { AccessEvent, ResourceRef } from '@vertz/server';
import {
  computeAccessSet,
  createAccessContext,
  createAccessEventBroadcaster,
  decodeAccessSet,
  defineAccess,
  encodeAccessSet,
  InMemoryClosureStore,
  InMemoryFlagStore,
  InMemoryRoleAssignmentStore,
} from '@vertz/server';

// ============================================================================
// Setup
// ============================================================================

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
    'project:view': { roles: ['viewer', 'contributor', 'manager'] },
    'project:edit': { roles: ['contributor', 'manager'] },
    'project:export': { roles: ['manager'], flags: ['export-v2'] },
    'project:ai-assist': { roles: ['contributor', 'manager'], flags: ['ai-assist'] },
    'project:beta': { roles: ['manager'], flags: ['beta-feature', 'beta-ui'] },
  },
});

async function createStores() {
  const closureStore = new InMemoryClosureStore();
  const roleStore = new InMemoryRoleAssignmentStore();
  const flagStore = new InMemoryFlagStore();

  await closureStore.addResource('Organization', 'org-1');
  await closureStore.addResource('Team', 'team-1', {
    parentType: 'Organization',
    parentId: 'org-1',
  });
  await closureStore.addResource('Project', 'proj-1', {
    parentType: 'Team',
    parentId: 'team-1',
  });

  await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');

  const orgResolver = async (resource?: ResourceRef) => {
    if (!resource) return null;
    const ancestors = await closureStore.getAncestors(resource.type, resource.id);
    const org = ancestors.find((a) => a.type === 'Organization');
    return org?.id ?? null;
  };

  return { closureStore, roleStore, flagStore, orgResolver };
}

// ============================================================================
// Feature Flag Store + Layer 1 Integration
// ============================================================================

describe('Feature Flag Store + Layer 1 (public imports)', () => {
  it('flag disabled → can() returns false with flag_disabled', async () => {
    const { closureStore, roleStore, flagStore, orgResolver } = await createStores();
    flagStore.setFlag('org-1', 'export-v2', false);

    const ctx = createAccessContext({
      userId: 'user-1',
      accessDef,
      closureStore,
      roleStore,
      flagStore,
      orgResolver,
    });

    // admin inherits contributor on Project, manager check fails
    // But user has 'admin' on Org which inherits 'editor' on Team which inherits 'contributor' on Project
    // project:export requires 'manager' role - admin -> editor -> contributor, NOT manager
    // So this would fail on role check first. Let me assign manager directly.
    await roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

    const result = await ctx.can('project:export', {
      type: 'Project',
      id: 'proj-1',
    });
    expect(result).toBe(false);

    const checkResult = await ctx.check('project:export', {
      type: 'Project',
      id: 'proj-1',
    });
    expect(checkResult.allowed).toBe(false);
    expect(checkResult.reasons).toContain('flag_disabled');
    expect(checkResult.meta?.disabledFlags).toEqual(['export-v2']);
  });

  it('flag enabled → can() returns true (passes Layer 1)', async () => {
    const { closureStore, roleStore, flagStore, orgResolver } = await createStores();
    flagStore.setFlag('org-1', 'export-v2', true);
    await roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

    const ctx = createAccessContext({
      userId: 'user-1',
      accessDef,
      closureStore,
      roleStore,
      flagStore,
      orgResolver,
    });

    const result = await ctx.can('project:export', {
      type: 'Project',
      id: 'proj-1',
    });
    expect(result).toBe(true);
  });

  it('no flags on entitlement → backward compat (always passes Layer 1)', async () => {
    const { closureStore, roleStore, flagStore, orgResolver } = await createStores();

    const ctx = createAccessContext({
      userId: 'user-1',
      accessDef,
      closureStore,
      roleStore,
      flagStore,
      orgResolver,
    });

    // project:view has no flags requirement — should pass Layer 1
    const result = await ctx.can('project:view', {
      type: 'Project',
      id: 'proj-1',
    });
    expect(result).toBe(true);
  });

  it('multiple flags — all must be enabled', async () => {
    const { closureStore, roleStore, flagStore, orgResolver } = await createStores();
    flagStore.setFlag('org-1', 'beta-feature', true);
    flagStore.setFlag('org-1', 'beta-ui', false);
    await roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

    const ctx = createAccessContext({
      userId: 'user-1',
      accessDef,
      closureStore,
      roleStore,
      flagStore,
      orgResolver,
    });

    const result = await ctx.can('project:beta', {
      type: 'Project',
      id: 'proj-1',
    });
    expect(result).toBe(false);

    // Enable both
    flagStore.setFlag('org-1', 'beta-ui', true);
    const result2 = await ctx.can('project:beta', {
      type: 'Project',
      id: 'proj-1',
    });
    expect(result2).toBe(true);
  });

  it('computeAccessSet includes flags from flagStore', async () => {
    const { closureStore, roleStore, flagStore } = await createStores();
    flagStore.setFlag('org-1', 'export-v2', true);
    flagStore.setFlag('org-1', 'ai-assist', false);

    // admin on Org → editor on Team → contributor on Project
    // project:export requires 'manager' role, so assign manager directly
    await roleStore.assign('user-1', 'Project', 'proj-1', 'manager');

    const set = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
      flagStore,
      orgId: 'org-1',
    });

    expect(set.flags['export-v2']).toBe(true);
    expect(set.flags['ai-assist']).toBe(false);

    // project:ai-assist should be denied (flag off, even though user has contributor role)
    expect(set.entitlements['project:ai-assist'].allowed).toBe(false);
    expect(set.entitlements['project:ai-assist'].reasons).toContain('flag_disabled');

    // project:export should be allowed (flag on + manager role)
    expect(set.entitlements['project:export'].allowed).toBe(true);
  });

  it('encode/decode round-trip preserves flag data', async () => {
    const { closureStore, roleStore, flagStore } = await createStores();
    flagStore.setFlag('org-1', 'export-v2', true);
    flagStore.setFlag('org-1', 'ai-assist', false);

    const original = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
      flagStore,
      orgId: 'org-1',
    });

    const encoded = encodeAccessSet(original);
    const decoded = decodeAccessSet(encoded, accessDef);

    expect(decoded.flags).toEqual(original.flags);
    expect(decoded.entitlements['project:export'].allowed).toBe(
      original.entitlements['project:export'].allowed,
    );
  });
});

// ============================================================================
// Access Event Broadcaster Integration
// ============================================================================

describe('Access Event Broadcaster (public imports)', () => {
  it('createAccessEventBroadcaster creates broadcaster with expected API', () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: 'test-secret-minimum-32-characters-long',
    });

    expect(typeof broadcaster.handleUpgrade).toBe('function');
    expect(typeof broadcaster.broadcastFlagToggle).toBe('function');
    expect(typeof broadcaster.broadcastLimitUpdate).toBe('function');
    expect(typeof broadcaster.broadcastRoleChange).toBe('function');
    expect(typeof broadcaster.broadcastPlanChange).toBe('function');
    expect(broadcaster.getConnectionCount).toBe(0);
  });

  it('broadcastFlagToggle formats correct AccessEvent', () => {
    const broadcaster = createAccessEventBroadcaster({
      jwtSecret: 'test-secret-minimum-32-characters-long',
    });

    // Create a mock ws to verify the broadcast payload
    const sentMessages: string[] = [];
    const mockWs = {
      data: { userId: 'user-1', orgId: 'org-1' },
      send(msg: string) {
        sentMessages.push(msg);
      },
      close() {},
      ping() {},
    };

    broadcaster.websocket.open(mockWs);
    broadcaster.broadcastFlagToggle('org-1', 'export-v2', true);

    expect(sentMessages.length).toBe(1);
    const event = JSON.parse(sentMessages[0]) as AccessEvent;
    expect(event.type).toBe('access:flag_toggled');
    if (event.type === 'access:flag_toggled') {
      expect(event.flag).toBe('export-v2');
      expect(event.enabled).toBe(true);
      expect(event.orgId).toBe('org-1');
    }
  });
});
