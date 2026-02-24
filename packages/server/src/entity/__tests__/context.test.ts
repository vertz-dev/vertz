import { describe, expect, it } from 'bun:test';
import { createEntityContext } from '../context';
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

describe('Feature: createEntityContext', () => {
  describe('Given a context with userId "user-1"', () => {
    describe('When calling ctx.authenticated()', () => {
      it('Then returns true', () => {
        const ctx = createEntityContext({ userId: 'user-1' }, stubOps(), {});

        expect(ctx.authenticated()).toBe(true);
      });
    });

    it('Then ctx.userId is "user-1"', () => {
      const ctx = createEntityContext({ userId: 'user-1' }, stubOps(), {});

      expect(ctx.userId).toBe('user-1');
    });
  });

  describe('Given a context with userId null', () => {
    describe('When calling ctx.authenticated()', () => {
      it('Then returns false', () => {
        const ctx = createEntityContext({ userId: null }, stubOps(), {});

        expect(ctx.authenticated()).toBe(false);
      });
    });
  });

  describe('Given a context with no userId', () => {
    describe('When calling ctx.authenticated()', () => {
      it('Then returns false (defaults to null)', () => {
        const ctx = createEntityContext({}, stubOps(), {});

        expect(ctx.userId).toBeNull();
        expect(ctx.authenticated()).toBe(false);
      });
    });
  });

  describe('Given a context with tenantId "tenant-1"', () => {
    describe('When calling ctx.tenant()', () => {
      it('Then returns true', () => {
        const ctx = createEntityContext({ tenantId: 'tenant-1' }, stubOps(), {});

        expect(ctx.tenant()).toBe(true);
      });
    });
  });

  describe('Given a context without tenantId', () => {
    describe('When calling ctx.tenant()', () => {
      it('Then returns false', () => {
        const ctx = createEntityContext({}, stubOps(), {});

        expect(ctx.tenant()).toBe(false);
      });
    });
  });

  describe('Given a context with roles ["admin", "editor"]', () => {
    describe('When calling ctx.role("admin")', () => {
      it('Then returns true', () => {
        const ctx = createEntityContext({ roles: ['admin', 'editor'] }, stubOps(), {});

        expect(ctx.role('admin')).toBe(true);
      });
    });

    describe('When calling ctx.role("viewer")', () => {
      it('Then returns false', () => {
        const ctx = createEntityContext({ roles: ['admin', 'editor'] }, stubOps(), {});

        expect(ctx.role('viewer')).toBe(false);
      });
    });

    describe('When calling ctx.role("admin", "viewer")', () => {
      it('Then returns true (matches any)', () => {
        const ctx = createEntityContext({ roles: ['admin', 'editor'] }, stubOps(), {});

        expect(ctx.role('admin', 'viewer')).toBe(true);
      });
    });
  });

  describe('Given a context with no roles', () => {
    describe('When calling ctx.role("admin")', () => {
      it('Then returns false', () => {
        const ctx = createEntityContext({}, stubOps(), {});

        expect(ctx.role('admin')).toBe(false);
      });
    });
  });

  describe('Given a context with entity operations', () => {
    describe('When accessing ctx.entity', () => {
      it('Then .get, .list, .create, .update, .delete methods exist', () => {
        const ops = stubOps();
        const ctx = createEntityContext({ userId: 'user-1' }, ops, {});

        expect(ctx.entity).toBe(ops);
        expect(typeof ctx.entity.get).toBe('function');
        expect(typeof ctx.entity.list).toBe('function');
        expect(typeof ctx.entity.create).toBe('function');
        expect(typeof ctx.entity.update).toBe('function');
        expect(typeof ctx.entity.delete).toBe('function');
      });
    });
  });

  describe('Given a context with entity registry proxy', () => {
    describe('When accessing ctx.entities.users', () => {
      it('Then returns the users operations', () => {
        const usersOps = stubOps();
        const ctx = createEntityContext({ userId: 'user-1' }, stubOps(), { users: usersOps });

        expect(ctx.entities.users).toBe(usersOps);
      });
    });
  });

  describe('Given a fully wired context with EntityRegistry', () => {
    describe('When an action handler uses ctx.entity and ctx.entities', () => {
      it('Then both calls resolve correctly', async () => {
        const usersOps = stubOps();
        usersOps.get = async (id: string) => ({ id, name: 'Alice' });

        const tasksOps = stubOps();
        tasksOps.update = async (_id: string, data: unknown) => ({
          id: 'task-1',
          ...(data as Record<string, unknown>),
        });

        const registry = new EntityRegistry();
        registry.register('users', usersOps);
        registry.register('tasks', tasksOps);

        const ctx = createEntityContext(
          { userId: 'user-1', roles: ['admin'] },
          tasksOps,
          registry.createProxy(),
        );

        // Simulate action handler: update own entity, read cross-entity
        const updated = await ctx.entity.update('task-1', { status: 'done' });
        expect(updated).toEqual({ id: 'task-1', status: 'done' });

        const user = await ctx.entities.users.get('user-1');
        expect(user).toEqual({ id: 'user-1', name: 'Alice' });

        expect(ctx.authenticated()).toBe(true);
        expect(ctx.role('admin')).toBe(true);
      });
    });
  });
});
