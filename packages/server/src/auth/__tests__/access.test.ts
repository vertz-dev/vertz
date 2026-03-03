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
