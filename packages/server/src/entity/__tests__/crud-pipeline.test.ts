import { ForbiddenException, NotFoundException } from '@vertz/core';
import { d } from '@vertz/db';
import { describe, expect, it, vi } from 'vitest';
import { createEntityContext } from '../context';
import { createCrudHandlers } from '../crud-pipeline';
import { entity } from '../entity';
import { EntityRegistry } from '../entity-registry';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  passwordHash: d.text().hidden(),
  role: d.enum('user_role', ['admin', 'editor', 'viewer']).default('viewer'),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

const usersModel = d.model(usersTable);

// ---------------------------------------------------------------------------
// Stub DB
// ---------------------------------------------------------------------------

function createStubDb() {
  const rows: Record<string, Record<string, unknown>> = {
    'user-1': {
      id: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
      passwordHash: 'hash123',
      role: 'admin',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    },
    'user-2': {
      id: 'user-2',
      email: 'bob@example.com',
      name: 'Bob',
      passwordHash: 'hash456',
      role: 'viewer',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    },
  };

  return {
    get: vi.fn(async (id: string) => rows[id] ?? null),
    list: vi.fn(async () => Object.values(rows)),
    create: vi.fn(async (data: Record<string, unknown>) => ({
      id: 'new-id',
      ...data,
      passwordHash: 'generated-hash',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    })),
    update: vi.fn(async (id: string, data: Record<string, unknown>) => ({
      ...rows[id],
      ...data,
      updatedAt: '2024-01-02',
    })),
    delete: vi.fn(async (id: string) => rows[id] ?? null),
  };
}

function makeCtx(overrides: { userId?: string | null; roles?: string[] } = {}) {
  const registry = new EntityRegistry();
  return createEntityContext(
    { userId: 'userId' in overrides ? overrides.userId : 'user-1', roles: overrides.roles ?? [] },
    {
      get: async () => ({}),
      list: async () => [],
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => {},
    },
    registry.createProxy(),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: CRUD pipeline', () => {
  // --- List ---

  describe('Given an entity with access: { list: (ctx) => ctx.authenticated() }', () => {
    const def = entity('users', {
      model: usersModel,
      access: { list: (ctx) => ctx.authenticated() },
    });

    describe('When an authenticated user calls list', () => {
      it('Then returns data array with hidden fields stripped', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = await handlers.list!(ctx);

        expect(result.status).toBe(200);
        expect(result.body.data).toHaveLength(2);
        // Hidden fields stripped
        for (const record of result.body.data) {
          expect(record).not.toHaveProperty('passwordHash');
        }
        // Non-hidden fields present
        expect(result.body.data[0]).toHaveProperty('email');
      });
    });

    describe('When an unauthenticated user calls list', () => {
      it('Then throws ForbiddenException', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ userId: null });

        await expect(handlers.list!(ctx)).rejects.toThrow(ForbiddenException);
      });
    });
  });

  // --- Get ---

  describe('Given an entity with access: { get: (ctx) => ctx.authenticated() }', () => {
    const def = entity('users', {
      model: usersModel,
      access: { get: (ctx) => ctx.authenticated() },
    });

    describe('When getting an existing record', () => {
      it('Then returns the record with hidden fields stripped', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = await handlers.get!(ctx, 'user-1');

        expect(result.status).toBe(200);
        expect(result.body).toHaveProperty('email', 'alice@example.com');
        expect(result.body).not.toHaveProperty('passwordHash');
      });
    });

    describe('When getting a non-existent record', () => {
      it('Then throws NotFoundException', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        await expect(handlers.get!(ctx, 'nonexistent')).rejects.toThrow(NotFoundException);
      });
    });
  });

  // --- Create ---

  describe('Given an entity with access: { create: (ctx) => ctx.role("admin") }', () => {
    const def = entity('users', {
      model: usersModel,
      access: { create: (ctx) => ctx.role('admin') },
    });

    describe('When an admin creates a record', () => {
      it('Then returns 201 with readOnly fields stripped from input and hidden fields stripped from response', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ roles: ['admin'] });

        const result = await handlers.create!(ctx, {
          email: 'new@example.com',
          name: 'New',
          createdAt: 'should-be-stripped',
          id: 'should-be-stripped',
        });

        expect(result.status).toBe(201);
        expect(result.body).not.toHaveProperty('passwordHash');
        // readOnly fields stripped from DB call
        const createCall = db.create.mock.calls[0]![0];
        expect(createCall).not.toHaveProperty('createdAt');
        expect(createCall).not.toHaveProperty('id');
        expect(createCall).toHaveProperty('email', 'new@example.com');
      });
    });

    describe('When a non-admin creates a record', () => {
      it('Then throws ForbiddenException', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ roles: ['viewer'] });

        await expect(
          handlers.create!(ctx, { email: 'new@example.com', name: 'New' }),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });

  // --- Before hooks ---

  describe('Given an entity with before.create hook', () => {
    const def = entity('users', {
      model: usersModel,
      access: { create: () => true },
      before: {
        create: (data, ctx) => ({ ...data, createdBy: ctx.userId }),
      },
    });

    describe('When creating a record', () => {
      it('Then the before.create transform is applied', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        await handlers.create!(ctx, { email: 'a@b.com', name: 'Test' });

        const createCall = db.create.mock.calls[0]![0];
        expect(createCall).toHaveProperty('createdBy', 'user-1');
      });
    });
  });

  // --- After hooks ---

  describe('Given an entity with after.create hook', () => {
    const afterSpy = vi.fn();
    const def = entity('users', {
      model: usersModel,
      access: { create: () => true },
      after: { create: afterSpy },
    });

    describe('When creating a record', () => {
      it('Then after.create fires with the created record', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        await handlers.create!(ctx, { email: 'a@b.com', name: 'Test' });

        expect(afterSpy).toHaveBeenCalledOnce();
        // First arg is the result, second is ctx
        expect(afterSpy.mock.calls[0]![0]).toHaveProperty('id');
        // Hidden fields must be stripped to prevent data leakage
        expect(afterSpy.mock.calls[0]![0]).not.toHaveProperty('passwordHash');
      });
    });
  });

  // --- Update ---

  describe('Given an entity with access: { update: (ctx, row) => row.id === ctx.userId }', () => {
    const def = entity('users', {
      model: usersModel,
      access: { update: (ctx, row) => row.id === ctx.userId },
    });

    describe('When the owner updates the record', () => {
      it('Then returns 200 with readOnly fields stripped', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ userId: 'user-1' });

        const result = await handlers.update!(ctx, 'user-1', {
          name: 'Updated',
          createdAt: 'should-be-stripped',
        });

        expect(result.status).toBe(200);
        expect(result.body).not.toHaveProperty('passwordHash');
        const updateCall = db.update.mock.calls[0]![1];
        expect(updateCall).not.toHaveProperty('createdAt');
        expect(updateCall).toHaveProperty('name', 'Updated');
      });
    });

    describe('When a non-owner updates the record', () => {
      it('Then throws ForbiddenException', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ userId: 'user-2' });

        await expect(handlers.update!(ctx, 'user-1', { name: 'Hacked' })).rejects.toThrow(
          ForbiddenException,
        );
      });
    });
  });

  describe('Given an entity with before.update hook', () => {
    const def = entity('users', {
      model: usersModel,
      access: { update: () => true },
      before: {
        update: (data, ctx) => ({ ...data, updatedBy: ctx.userId }),
      },
    });

    describe('When updating a record', () => {
      it('Then the before.update transform is applied', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        await handlers.update!(ctx, 'user-1', { name: 'Updated' });

        const updateCall = db.update.mock.calls[0]![1];
        expect(updateCall).toHaveProperty('updatedBy', 'user-1');
      });
    });
  });

  describe('Given an entity with after.update hook', () => {
    const afterUpdateSpy = vi.fn();
    const def = entity('users', {
      model: usersModel,
      access: { update: () => true },
      after: { update: afterUpdateSpy },
    });

    describe('When updating a record', () => {
      it('Then after.update fires with stripped previous and updated records', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        await handlers.update!(ctx, 'user-1', { name: 'Updated' });

        expect(afterUpdateSpy).toHaveBeenCalledOnce();
        // First arg is previous record, second is updated record
        const [prev, next] = afterUpdateSpy.mock.calls[0]!;
        expect(prev).toHaveProperty('id', 'user-1');
        expect(next).toHaveProperty('name', 'Updated');
        // Hidden fields must be stripped to prevent data leakage
        expect(prev).not.toHaveProperty('passwordHash');
        expect(next).not.toHaveProperty('passwordHash');
      });
    });
  });

  // --- Delete ---

  describe('Given an entity with access: { delete: (ctx) => ctx.role("admin") }', () => {
    const def = entity('users', {
      model: usersModel,
      access: { delete: (ctx) => ctx.role('admin') },
    });

    describe('When an admin deletes a record', () => {
      it('Then returns 204', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ roles: ['admin'] });

        const result = await handlers.delete!(ctx, 'user-1');

        expect(result.status).toBe(204);
        expect(result.body).toBeNull();
        expect(db.delete).toHaveBeenCalledWith('user-1');
      });
    });
  });

  describe('Given an entity with after.delete hook', () => {
    const afterDeleteSpy = vi.fn();
    const def = entity('users', {
      model: usersModel,
      access: { delete: () => true },
      after: { delete: afterDeleteSpy },
    });

    describe('When deleting a record', () => {
      it('Then after.delete fires with the deleted record', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        await handlers.delete!(ctx, 'user-1');

        expect(afterDeleteSpy).toHaveBeenCalledOnce();
        expect(afterDeleteSpy.mock.calls[0]![0]).toHaveProperty('id', 'user-1');
        // Hidden fields must be stripped to prevent data leakage
        expect(afterDeleteSpy.mock.calls[0]![0]).not.toHaveProperty('passwordHash');
      });
    });
  });

  // --- Disabled operations ---

  describe('Given an entity with access: { delete: false }', () => {
    const def = entity('users', {
      model: usersModel,
      access: { list: () => true, delete: false },
    });

    describe('When attempting to delete', () => {
      it('Then throws ForbiddenException (disabled)', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        await expect(handlers.delete!(ctx, 'user-1')).rejects.toThrow(/disabled/);
      });
    });
  });

  // --- Deny by default ---

  describe('Given an entity with access: { list: () => true } (only list defined)', () => {
    const def = entity('users', {
      model: usersModel,
      access: { list: () => true },
    });

    describe('When attempting to create (no access rule)', () => {
      it('Then throws ForbiddenException', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        await expect(handlers.create!(ctx, { email: 'a@b.com', name: 'New' })).rejects.toThrow(
          ForbiddenException,
        );
      });
    });
  });

  // --- No access rules → no handlers ---

  describe('Given an entity with no access rules', () => {
    const def = entity('users', { model: usersModel });

    describe('When building CRUD handlers', () => {
      it('Then all handlers throw ForbiddenException (deny by default)', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        await expect(handlers.list!(ctx)).rejects.toThrow(ForbiddenException);
        await expect(handlers.get!(ctx, 'user-1')).rejects.toThrow(ForbiddenException);
        await expect(handlers.create!(ctx, {})).rejects.toThrow(ForbiddenException);
        await expect(handlers.update!(ctx, 'user-1', {})).rejects.toThrow(ForbiddenException);
        await expect(handlers.delete!(ctx, 'user-1')).rejects.toThrow(ForbiddenException);
      });
    });
  });

  // --- After hooks don't block response ---

  describe('Given an entity with a throwing after.create hook', () => {
    const def = entity('users', {
      model: usersModel,
      access: { create: () => true },
      after: {
        create: () => {
          throw new Error('after hook error');
        },
      },
    });

    describe('When creating a record', () => {
      it('Then still returns 201 (after hook error is swallowed)', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = await handlers.create!(ctx, { email: 'a@b.com', name: 'Test' });

        expect(result.status).toBe(201);
      });
    });
  });
});
