import { describe, expect, it } from 'bun:test';
import { EntityRegistry } from '../entity-registry';
import type { EntityDefinition } from '../types';

// ---------------------------------------------------------------------------
// Minimal stubs
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

function stubEntityDef(name: string, injectNames: string[] = []): EntityDefinition {
  const inject: Record<string, EntityDefinition> = {};
  for (const n of injectNames) {
    inject[n] = stubEntityDef(n);
  }
  return {
    name,
    model: {} as EntityDefinition['model'],
    inject,
    access: {},
    before: {},
    after: {},
    actions: {},
    relations: {},
  };
}

// ---------------------------------------------------------------------------
// Tests: createScopedProxy
// ---------------------------------------------------------------------------

describe('Feature: Entity injection scoped proxy', () => {
  describe('Given an entity with inject: { users: usersEntity }', () => {
    describe('When accessing proxy.users', () => {
      it('Then returns the users EntityOperations from the registry', () => {
        const registry = new EntityRegistry();
        const usersOps = stubOps();
        registry.register('users', usersOps);
        registry.register('orders', stubOps());

        const injectMap = { users: stubEntityDef('users') };
        const proxy = registry.createScopedProxy(injectMap);

        expect(proxy.users).toBe(usersOps);
      });
    });
  });

  describe('Given an entity with inject: { users: usersEntity }', () => {
    describe('When accessing proxy.products (not injected)', () => {
      it('Then throws because products is not injected', () => {
        const registry = new EntityRegistry();
        registry.register('users', stubOps());
        registry.register('products', stubOps());

        const injectMap = { users: stubEntityDef('users') };
        const proxy = registry.createScopedProxy(injectMap);

        expect(() => (proxy as Record<string, unknown>).products).toThrow(/not declared in inject/);
      });
    });
  });

  describe('Given an entity with no inject declaration', () => {
    describe('When accessing proxy.anything', () => {
      it('Then throws because no entities are injected', () => {
        const registry = new EntityRegistry();
        registry.register('users', stubOps());

        const proxy = registry.createScopedProxy({});

        expect(() => (proxy as Record<string, unknown>).users).toThrow(/not declared in inject/);
      });
    });
  });

  describe('Given two entities that inject each other (circular)', () => {
    describe('When both are registered and accessed via scoped proxies', () => {
      it('Then both can access each other via their scoped proxy', async () => {
        const registry = new EntityRegistry();
        const usersOps = stubOps();
        usersOps.get = async (id: string) => ({ id, name: 'Alice' });
        const ordersOps = stubOps();
        ordersOps.get = async (id: string) => ({ id, status: 'pending' });

        registry.register('users', usersOps);
        registry.register('orders', ordersOps);

        // Circular: users injects orders, orders injects users
        const usersInject = { orders: stubEntityDef('orders') };
        const ordersInject = { users: stubEntityDef('users') };

        const usersProxy = registry.createScopedProxy(usersInject);
        const ordersProxy = registry.createScopedProxy(ordersInject);

        // Users can access orders
        const order = await usersProxy.orders.get('order-1');
        expect(order).toEqual({ id: 'order-1', status: 'pending' });

        // Orders can access users
        const user = await ordersProxy.users.get('user-1');
        expect(user).toEqual({ id: 'user-1', name: 'Alice' });
      });
    });
  });

  describe('Given a scoped proxy with inject: { users: usersEntity }', () => {
    describe('When accessing symbol properties (e.g., Symbol.toPrimitive)', () => {
      it('Then returns undefined (no error)', () => {
        const registry = new EntityRegistry();
        registry.register('users', stubOps());

        const proxy = registry.createScopedProxy({ users: stubEntityDef('users') });

        // Symbol access should not throw
        expect((proxy as Record<symbol, unknown>)[Symbol.toPrimitive]).toBeUndefined();
      });
    });
  });
});
