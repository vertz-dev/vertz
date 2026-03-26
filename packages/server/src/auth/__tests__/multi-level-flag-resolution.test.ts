import { describe, expect, it } from 'bun:test';
import { InMemoryClosureStore } from '../closure-store';
import { defineAccess } from '../define-access';
import { InMemoryFlagStore } from '../flag-store';
import { InMemoryRoleAssignmentStore } from '../role-assignment-store';
import { type AncestorChainEntry, computeAccessSet } from '../access-set';

// ---------------------------------------------------------------------------
// Fixtures: 2-level hierarchy (account -> project)
// ---------------------------------------------------------------------------

function createAccessDef() {
  return defineAccess({
    entities: {
      account: { roles: ['owner'] },
      project: {
        roles: ['admin'],
        inherits: { 'account:owner': 'admin' },
      },
    },
    entitlements: {
      'project:view': { roles: ['admin'] },
      'project:ai-generate': { roles: ['admin'], flags: ['beta_ai'] },
    },
  });
}

function mockAncestorResolver(
  ancestors: Record<string, AncestorChainEntry[]>,
): (tenantLevel: string, tenantId: string) => Promise<AncestorChainEntry[]> {
  return async (_level: string, id: string) => ancestors[id] ?? [];
}

async function setupStores() {
  const roleStore = new InMemoryRoleAssignmentStore();
  const closureStore = new InMemoryClosureStore();
  const flagStore = new InMemoryFlagStore();

  await closureStore.addResource('account', 'acct-1');
  await closureStore.addResource('project', 'proj-1', {
    parentType: 'account',
    parentId: 'acct-1',
  });
  await roleStore.assign('user-1', 'account', 'acct-1', 'owner');

  return { roleStore, closureStore, flagStore };
}

// ==========================================================================
// Tests
// ==========================================================================

describe('Feature: Multi-level flag resolution (deepest wins)', () => {
  describe('Given account flag beta_ai: true and project flag beta_ai: false', () => {
    it('Then resolves to false at project level (deepest wins)', async () => {
      const accessDef = createAccessDef();
      const { roleStore, closureStore, flagStore } = await setupStores();

      flagStore.setFlag('acct-1', 'beta_ai', true);
      flagStore.setFlag('proj-1', 'beta_ai', false);

      const result = await computeAccessSet({
        userId: 'user-1',
        accessDef,
        roleStore,
        closureStore,
        flagStore,
        tenantId: 'proj-1',
        tenantLevel: 'project',
        ancestorResolver: mockAncestorResolver({
          'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
        }),
      });

      expect(result.flags['beta_ai']).toBe(false);
    });
  });

  describe('Given account flag beta_ai: true, project has no beta_ai flag', () => {
    it('Then resolves to true (inherited from account)', async () => {
      const accessDef = createAccessDef();
      const { roleStore, closureStore, flagStore } = await setupStores();

      flagStore.setFlag('acct-1', 'beta_ai', true);
      // Project has NO beta_ai flag set

      const result = await computeAccessSet({
        userId: 'user-1',
        accessDef,
        roleStore,
        closureStore,
        flagStore,
        tenantId: 'proj-1',
        tenantLevel: 'project',
        ancestorResolver: mockAncestorResolver({
          'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
        }),
      });

      expect(result.flags['beta_ai']).toBe(true);
    });
  });

  describe('Given neither account nor project has beta_ai flag', () => {
    it('Then resolves to false (default)', async () => {
      const accessDef = createAccessDef();
      const { roleStore, closureStore, flagStore } = await setupStores();

      // No beta_ai flag set at any level

      const result = await computeAccessSet({
        userId: 'user-1',
        accessDef,
        roleStore,
        closureStore,
        flagStore,
        tenantId: 'proj-1',
        tenantLevel: 'project',
        ancestorResolver: mockAncestorResolver({
          'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
        }),
      });

      // Flag not set anywhere → defaults to not being in flags or being false
      expect(result.flags['beta_ai']).toBeFalsy();
    });
  });

  describe('Given flag-gated entitlement and project disables the flag', () => {
    it('Then entitlement is denied with flag_disabled reason', async () => {
      const accessDef = createAccessDef();
      const { roleStore, closureStore, flagStore } = await setupStores();

      flagStore.setFlag('acct-1', 'beta_ai', true);
      flagStore.setFlag('proj-1', 'beta_ai', false);

      const result = await computeAccessSet({
        userId: 'user-1',
        accessDef,
        roleStore,
        closureStore,
        flagStore,
        tenantId: 'proj-1',
        tenantLevel: 'project',
        ancestorResolver: mockAncestorResolver({
          'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
        }),
      });

      expect(result.entitlements['project:ai-generate'].allowed).toBe(false);
      expect(result.entitlements['project:ai-generate'].reasons).toContain('flag_disabled');
    });
  });

  describe('Given single-level tenancy', () => {
    it('Then flag behavior is unchanged (no ancestorResolver)', async () => {
      const accessDef = createAccessDef();
      const { roleStore, closureStore, flagStore } = await setupStores();

      flagStore.setFlag('acct-1', 'beta_ai', true);

      // No ancestorResolver — single-level
      const result = await computeAccessSet({
        userId: 'user-1',
        accessDef,
        roleStore,
        closureStore,
        flagStore,
        tenantId: 'acct-1',
      });

      expect(result.flags['beta_ai']).toBe(true);
      expect(result.entitlements['project:ai-generate'].allowed).toBe(true);
    });
  });
});
