import { describe, expect, it } from 'bun:test';
import { createAccessContext } from '../access-context';
import { InMemoryClosureStore } from '../closure-store';
import { defineAccess } from '../define-access';
import { computeEntityAccess } from '../entity-access';
import { InMemoryRoleAssignmentStore } from '../role-assignment-store';

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
    'project:view': { roles: ['viewer', 'contributor', 'manager'] },
    'project:edit': { roles: ['contributor', 'manager'] },
    'project:delete': { roles: ['manager'] },
  },
});

async function createTestContext(userId: string | null) {
  const roleStore = new InMemoryRoleAssignmentStore();
  const closureStore = new InMemoryClosureStore();

  await closureStore.addResource('organization', 'org-1');
  await closureStore.addResource('project', 'proj-1', {
    parentType: 'organization',
    parentId: 'org-1',
  });

  return { roleStore, closureStore, userId };
}

describe('computeEntityAccess', () => {
  it('returns allowed for entitled user on resource', async () => {
    const { roleStore, closureStore, userId } = await createTestContext('user-1');
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');

    const ctx = createAccessContext({
      userId,
      accessDef,
      closureStore,
      roleStore,
    });

    const result = await computeEntityAccess(
      ['project:view', 'project:edit'],
      { type: 'project', id: 'proj-1' },
      ctx,
    );

    expect(result['project:view'].allowed).toBe(true);
    expect(result['project:edit'].allowed).toBe(true);
  });

  it('returns denied for unentitled user on resource', async () => {
    const { roleStore, closureStore, userId } = await createTestContext('user-1');
    await roleStore.assign('user-1', 'organization', 'org-1', 'member');

    const ctx = createAccessContext({
      userId,
      accessDef,
      closureStore,
      roleStore,
    });

    const result = await computeEntityAccess(
      ['project:edit', 'project:delete'],
      { type: 'project', id: 'proj-1' },
      ctx,
    );

    expect(result['project:edit'].allowed).toBe(false);
    expect(result['project:delete'].allowed).toBe(false);
  });

  it('handles multiple entitlements', async () => {
    const { roleStore, closureStore, userId } = await createTestContext('user-1');
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');

    const ctx = createAccessContext({
      userId,
      accessDef,
      closureStore,
      roleStore,
    });

    const result = await computeEntityAccess(
      ['project:view', 'project:edit', 'project:delete'],
      { type: 'project', id: 'proj-1' },
      ctx,
    );

    expect(result['project:view'].allowed).toBe(true);
    expect(result['project:edit'].allowed).toBe(true);
    // admin -> contributor, which doesn't include manager
    expect(result['project:delete'].allowed).toBe(false);
  });

  it('returns empty object for empty entitlements array', async () => {
    const { roleStore, closureStore, userId } = await createTestContext('user-1');

    const ctx = createAccessContext({
      userId,
      accessDef,
      closureStore,
      roleStore,
    });

    const result = await computeEntityAccess([], { type: 'project', id: 'proj-1' }, ctx);

    expect(result).toEqual({});
  });

  it('result is serializable (no circular refs, no functions)', async () => {
    const { roleStore, closureStore, userId } = await createTestContext('user-1');
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');

    const ctx = createAccessContext({
      userId,
      accessDef,
      closureStore,
      roleStore,
    });

    const result = await computeEntityAccess(
      ['project:view'],
      { type: 'project', id: 'proj-1' },
      ctx,
    );

    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);
    expect(parsed['project:view'].allowed).toBe(true);
  });
});
