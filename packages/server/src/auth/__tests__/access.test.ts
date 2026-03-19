import { describe, expect, it } from 'bun:test';
import { createAccess } from '../access';

const testAccess = createAccess({
  roles: {
    admin: { entitlements: ['user:read', 'user:delete', 'post:*'] },
    user: { entitlements: ['user:read', 'post:update'] },
  },
  entitlements: {
    'user:read': { roles: ['user', 'admin'] },
    'user:delete': { roles: ['admin'] },
    'post:update': { roles: ['user', 'admin'] },
  },
});

const now = new Date();
const adminUser = {
  id: '1',
  email: 'admin@test.com',
  role: 'admin',
  createdAt: now,
  updatedAt: now,
};
const normalUser = {
  id: '2',
  email: 'user@test.com',
  role: 'user',
  createdAt: now,
  updatedAt: now,
};

describe('createAccess — default-deny', () => {
  it('denies access when entitlement is not defined in config', async () => {
    // 'post:create' is not in the entitlements config
    expect(await testAccess.can('post:create', adminUser)).toBe(false);
  });

  it('allows access when user role matches entitlement config', async () => {
    expect(await testAccess.can('user:delete', adminUser)).toBe(true);
  });

  it('denies access to unauthenticated users', async () => {
    expect(await testAccess.can('user:read', null)).toBe(false);
  });

  it('denies access when user role is not in entitlement roles', async () => {
    expect(await testAccess.can('user:delete', normalUser)).toBe(false);
  });
});

describe('canWithResource — ownership validation', () => {
  it('allows access when resource has no ownerId', async () => {
    const resource = { id: 'post-1', type: 'post' };
    expect(await testAccess.canWithResource('post:update', resource, normalUser)).toBe(true);
  });

  it('allows access when resource ownerId matches user id', async () => {
    const resource = { id: 'post-1', type: 'post', ownerId: '2' };
    expect(await testAccess.canWithResource('post:update', resource, normalUser)).toBe(true);
  });

  it('denies access when resource ownerId does not match user id', async () => {
    const resource = { id: 'post-1', type: 'post', ownerId: '999' };
    expect(await testAccess.canWithResource('post:update', resource, normalUser)).toBe(false);
  });

  it('allows access with empty string ownerId (not nullish)', async () => {
    // Empty string is not nullish — ownership check is skipped
    const resource = { id: 'post-1', type: 'post', ownerId: '' };
    expect(await testAccess.canWithResource('post:update', resource, normalUser)).toBe(true);
  });

  it('denies unauthenticated users even with no ownerId', async () => {
    const resource = { id: 'post-1', type: 'post' };
    expect(await testAccess.canWithResource('post:update', resource, null)).toBe(false);
  });
});

describe('authorizeWithResource — throws on denied resource access', () => {
  it('throws when resource ownership check fails', async () => {
    const resource = { id: 'post-1', type: 'post', ownerId: '999' };
    await expect(
      testAccess.authorizeWithResource('post:update', resource, normalUser),
    ).rejects.toThrow('Not authorized to perform this action on this resource');
  });

  it('does not throw when resource ownership passes', async () => {
    const resource = { id: 'post-1', type: 'post', ownerId: '2' };
    await expect(
      testAccess.authorizeWithResource('post:update', resource, normalUser),
    ).resolves.toBeUndefined();
  });
});

describe('middleware — ctx.authorize with resource', () => {
  it('attaches ctx.authorize that supports resource parameter', async () => {
    const mw = testAccess.middleware();
    const ctx: any = { user: normalUser };
    await mw(ctx, async () => {});

    // authorize with resource where ownership matches
    const resource = { id: 'post-1', type: 'post', ownerId: '2' };
    await expect(ctx.authorize('post:update', resource)).resolves.toBeUndefined();
  });

  it('ctx.authorize with resource throws when ownership fails', async () => {
    const mw = testAccess.middleware();
    const ctx: any = { user: normalUser };
    await mw(ctx, async () => {});

    const resource = { id: 'post-1', type: 'post', ownerId: '999' };
    await expect(ctx.authorize('post:update', resource)).rejects.toThrow('Not authorized');
  });

  it('ctx.can with resource delegates to canWithResource', async () => {
    const mw = testAccess.middleware();
    const ctx: any = { user: normalUser };
    await mw(ctx, async () => {});

    const resource = { id: 'post-1', type: 'post', ownerId: '2' };
    expect(await ctx.can('post:update', resource)).toBe(true);

    const otherResource = { id: 'post-2', type: 'post', ownerId: '999' };
    expect(await ctx.can('post:update', otherResource)).toBe(false);
  });
});

describe('authorize — throws on denied access', () => {
  it('throws AuthorizationError when user lacks entitlement', async () => {
    await expect(testAccess.authorize('user:delete', normalUser)).rejects.toThrow(
      'Not authorized to perform this action: user:delete',
    );
  });

  it('does not throw when user has entitlement', async () => {
    await expect(testAccess.authorize('user:read', normalUser)).resolves.toBeUndefined();
  });

  it('throws for null user', async () => {
    await expect(testAccess.authorize('user:read', null)).rejects.toThrow('Not authorized');
  });
});

describe('canAll — bulk entitlement checks', () => {
  it('checks multiple entitlements at once', async () => {
    const results = await testAccess.canAll(
      [{ entitlement: 'user:read' }, { entitlement: 'user:delete' }],
      normalUser,
    );
    expect(results.get('user:read')).toBe(true);
    expect(results.get('user:delete')).toBe(false);
  });

  it('checks with resource context', async () => {
    const ownedResource = { id: 'post-1', type: 'post', ownerId: '2' };
    const otherResource = { id: 'post-2', type: 'post', ownerId: '999' };
    const results = await testAccess.canAll(
      [
        { entitlement: 'post:update', resource: ownedResource },
        { entitlement: 'post:update', resource: otherResource },
      ],
      normalUser,
    );
    expect(results.get('post:update:post-1')).toBe(true);
    expect(results.get('post:update:post-2')).toBe(false);
  });
});

describe('getEntitlementsForRole', () => {
  it('returns entitlements for a valid role', () => {
    const entitlements = testAccess.getEntitlementsForRole('admin');
    expect(entitlements).toContain('user:read');
    expect(entitlements).toContain('user:delete');
    expect(entitlements).toContain('post:*');
  });

  it('returns empty array for unknown role', () => {
    expect(testAccess.getEntitlementsForRole('nonexistent')).toEqual([]);
  });
});
