import { describe, expect, it } from 'bun:test';
import { EntityRegistry } from '../entity-registry';

// ---------------------------------------------------------------------------
// Minimal stub for EntityOperations
// ---------------------------------------------------------------------------

function stubOps() {
  return {
    get: async () => ({}),
    list: async () => [],
    create: async () => ({}),
    update: async () => ({}),
    delete: async () => {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: EntityRegistry', () => {
  describe('Given an empty EntityRegistry', () => {
    describe('When registering an entity with name "users"', () => {
      it('Then registry.has("users") returns true', () => {
        const registry = new EntityRegistry();
        const ops = stubOps();

        registry.register('users', ops);

        expect(registry.has('users')).toBe(true);
      });

      it('Then registry.get("users") returns the operations', () => {
        const registry = new EntityRegistry();
        const ops = stubOps();

        registry.register('users', ops);

        expect(registry.get('users')).toBe(ops);
      });
    });
  });

  describe('Given an empty EntityRegistry', () => {
    describe('When checking for an unregistered entity', () => {
      it('Then registry.has("comments") returns false', () => {
        const registry = new EntityRegistry();

        expect(registry.has('comments')).toBe(false);
      });

      it('Then registry.get("comments") throws with available entity names', () => {
        const registry = new EntityRegistry();
        registry.register('users', stubOps());
        registry.register('posts', stubOps());

        expect(() => registry.get('comments')).toThrow(/Entity "comments" is not registered/);
        expect(() => registry.get('comments')).toThrow(/users/);
        expect(() => registry.get('comments')).toThrow(/posts/);
      });
    });
  });

  describe('Given an EntityRegistry with "users" already registered', () => {
    describe('When registering "users" again', () => {
      it('Then throws with duplicate error', () => {
        const registry = new EntityRegistry();
        registry.register('users', stubOps());

        expect(() => registry.register('users', stubOps())).toThrow(
          /Entity "users" is already registered/,
        );
      });
    });
  });

  describe('Given an EntityRegistry with users and posts', () => {
    describe('When creating a proxy', () => {
      it('Then proxy.users returns the users operations', () => {
        const registry = new EntityRegistry();
        const usersOps = stubOps();
        registry.register('users', usersOps);
        registry.register('posts', stubOps());

        const proxy = registry.createProxy();

        expect(proxy.users).toBe(usersOps);
      });

      it('Then proxy.nonexistent throws', () => {
        const registry = new EntityRegistry();
        registry.register('users', stubOps());

        const proxy = registry.createProxy();

        expect(() => proxy.nonexistent).toThrow(/Entity "nonexistent" is not registered/);
      });
    });
  });
});
