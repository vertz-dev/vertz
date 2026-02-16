/**
 * Access Control Tests - Phase 1
 * Tests for createAccess(), ctx.can(), ctx.authorize()
 */

import { describe, expect, it } from 'vitest';
import { AuthorizationError, createAccess } from '../../auth/access';
import type { AuthUser } from '../../auth/types';

describe('Access Control Module', () => {
  const testUser: AuthUser = {
    id: 'user-1',
    email: 'test@example.com',
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const adminUser: AuthUser = {
    id: 'admin-1',
    email: 'admin@example.com',
    role: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const editorUser: AuthUser = {
    id: 'editor-1',
    email: 'editor@example.com',
    role: 'editor',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('createAccess', () => {
    it('should create an access instance', () => {
      const access = createAccess({
        roles: { user: { entitlements: ['read'] } },
        entitlements: { 'user:read': { roles: ['user'] } },
      });

      expect(access.can).toBeDefined();
      expect(access.authorize).toBeDefined();
      expect(access.middleware).toBeDefined();
    });
  });

  describe('can() - Entitlement Check', () => {
    it('should allow user with correct role', async () => {
      const access = createAccess({
        roles: { user: { entitlements: ['read', 'create'] } },
        entitlements: {
          'user:read': { roles: ['user'] },
          'user:create': { roles: ['user'] },
        },
      });

      const result = await access.can('user:read', testUser);
      expect(result).toBe(true);
    });

    it('should deny user without correct role', async () => {
      const access = createAccess({
        roles: { user: { entitlements: ['read'] } },
        entitlements: {
          'user:delete': { roles: ['admin'] },
        },
      });

      const result = await access.can('user:delete', testUser);
      expect(result).toBe(false);
    });

    it('should deny for null user', async () => {
      const access = createAccess({
        roles: { user: { entitlements: ['read'] } },
        entitlements: { 'user:read': { roles: ['user'] } },
      });

      const result = await access.can('user:read', null);
      expect(result).toBe(false);
    });

    it('should allow admin for any entitlement in their role', async () => {
      const access = createAccess({
        roles: { admin: { entitlements: ['user:delete'] } },
        entitlements: { 'user:delete': { roles: ['admin'] } },
      });

      const result = await access.can('user:delete', adminUser);
      expect(result).toBe(true);
    });

    it('should handle wildcard entitlements', async () => {
      const access = createAccess({
        roles: { admin: { entitlements: ['user:*'] } },
        entitlements: {
          'user:read': { roles: ['admin'] },
          'user:write': { roles: ['admin'] },
        },
      });

      const result = await access.can('user:write', adminUser);
      expect(result).toBe(true);
    });
  });

  describe('canWithResource()', () => {
    it('should check entitlement with resource context', async () => {
      const access = createAccess({
        roles: { user: { entitlements: ['post:read'] } },
        entitlements: { 'post:read': { roles: ['user'] } },
      });

      const resource = { id: 'post-1', type: 'post' };
      const result = await access.canWithResource('post:read', resource, testUser);
      expect(result).toBe(true);
    });

    it('should deny entitlement for resource without permission', async () => {
      const access = createAccess({
        roles: { user: { entitlements: ['post:read'] } },
        entitlements: { 'post:delete': { roles: ['admin'] } },
      });

      const resource = { id: 'post-1', type: 'post' };
      const result = await access.canWithResource('post:delete', resource, testUser);
      expect(result).toBe(false);
    });
  });

  describe('authorize()', () => {
    it('should not throw when authorized', async () => {
      const access = createAccess({
        roles: { user: { entitlements: ['read'] } },
        entitlements: { read: { roles: ['user'] } },
      });

      // Should resolve without error
      const result = await access.authorize('read', testUser);
      expect(result).toBeUndefined();
    });

    it('should throw AuthorizationError when not authorized', async () => {
      const access = createAccess({
        roles: { user: { entitlements: ['read'] } },
        entitlements: { delete: { roles: ['admin'] } },
      });

      await expect(access.authorize('delete', testUser)).rejects.toThrow(AuthorizationError);
    });

    it('should throw with entitlement info in error', async () => {
      const access = createAccess({
        roles: { user: { entitlements: [] } },
        entitlements: { 'secret:access': { roles: ['admin'] } },
      });

      try {
        await access.authorize('secret:access', testUser);
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthorizationError);
        expect((err as AuthorizationError).entitlement).toBe('secret:access');
      }
    });
  });

  describe('canAll() - Bulk Check', () => {
    it('should check multiple entitlements', async () => {
      const access = createAccess({
        roles: { user: { entitlements: ['read', 'create'] } },
        entitlements: {
          read: { roles: ['user'] },
          create: { roles: ['user'] },
          delete: { roles: ['admin'] },
        },
      });

      const results = await access.canAll(
        [{ entitlement: 'read' }, { entitlement: 'create' }, { entitlement: 'delete' }],
        testUser,
      );

      expect(results.get('read')).toBe(true);
      expect(results.get('create')).toBe(true);
      expect(results.get('delete')).toBe(false);
    });

    it('should include resource context in keys', async () => {
      const access = createAccess({
        roles: { user: { entitlements: ['post:read'] } },
        entitlements: { 'post:read': { roles: ['user'] } },
      });

      const results = await access.canAll(
        [{ entitlement: 'post:read', resource: { id: 'post-1', type: 'post' } }],
        testUser,
      );

      expect(results.has('post:read:post-1')).toBe(true);
    });
  });

  describe('getEntitlementsForRole()', () => {
    it('should return all entitlements for a role', () => {
      const access = createAccess({
        roles: {
          user: { entitlements: ['read', 'create'] },
          admin: { entitlements: ['read', 'create', 'update', 'delete'] },
        },
        entitlements: {},
      });

      const userEnts = access.getEntitlementsForRole('user');
      expect(userEnts).toContain('read');
      expect(userEnts).toContain('create');

      const adminEnts = access.getEntitlementsForRole('admin');
      expect(adminEnts).toContain('delete');
    });

    it('should return empty array for unknown role', () => {
      const access = createAccess({
        roles: {},
        entitlements: {},
      });

      const ents = access.getEntitlementsForRole('unknown');
      expect(ents).toEqual([]);
    });
  });

  describe('Middleware', () => {
    it('should add can and authorize to context', async () => {
      const access = createAccess({
        roles: { user: { entitlements: ['test:action'] } },
        entitlements: { 'test:action': { roles: ['user'] } },
      });

      const middleware = access.middleware();
      const ctx: any = { user: testUser };
      let middlewareCalled = false;

      await middleware(ctx, async () => {
        middlewareCalled = true;
      });

      expect(middlewareCalled).toBe(true);
      expect(typeof ctx.can).toBe('function');
      expect(typeof ctx.authorize).toBe('function');
    });

    it('should allow checking via ctx.can()', async () => {
      const access = createAccess({
        roles: { user: { entitlements: ['test:action'] } },
        entitlements: { 'test:action': { roles: ['user'] } },
      });

      const middleware = access.middleware();
      const ctx: any = { user: testUser };

      await middleware(ctx, async () => {
        const result = await ctx.can('test:action');
        expect(result).toBe(true);
      });
    });

    it('should handle null user in middleware', async () => {
      const access = createAccess({
        roles: { user: { entitlements: ['test:action'] } },
        entitlements: { 'test:action': { roles: ['user'] } },
      });

      const middleware = access.middleware();
      const ctx: any = { user: null };

      await middleware(ctx, async () => {
        const result = await ctx.can('test:action');
        expect(result).toBe(false);
      });
    });
  });

  describe('Default Access Config', () => {
    it('should have default roles and entitlements', async () => {
      // Import the default access
      const { defaultAccess } = await import('../../auth/access');

      // User should be able to read
      expect(await defaultAccess.can('read', testUser)).toBe(true);

      // User should not be able to delete
      expect(await defaultAccess.can('delete', testUser)).toBe(false);

      // Admin should be able to delete
      expect(await defaultAccess.can('delete', adminUser)).toBe(true);

      // Editor should be able to update
      expect(await defaultAccess.can('update', editorUser)).toBe(true);
    });
  });
});
