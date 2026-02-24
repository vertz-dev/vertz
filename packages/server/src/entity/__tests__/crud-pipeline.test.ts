import { ForbiddenException } from '@vertz/core';
import { EntityNotFoundError } from '@vertz/errors';
import { d } from '@vertz/db';
import { unwrap } from '@vertz/errors';
import { describe, expect, it, mock } from 'bun:test';
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
    get: mock(async (id: string) => rows[id] ?? null),
    list: mock(
      async (options?: { where?: Record<string, unknown>; limit?: number; after?: string }) => {
        let result = Object.values(rows);
        const where = options?.where;
        if (where) {
          result = result.filter((row) =>
            Object.entries(where).every(([key, value]) => row[key] === value),
          );
        }
        const total = result.length;
        if (options?.after) {
          const afterIdx = result.findIndex((r) => r.id === options.after);
          result = afterIdx >= 0 ? result.slice(afterIdx + 1) : [];
        }
        if (options?.limit !== undefined) {
          result = result.slice(0, options.limit);
        }
        return { data: result, total };
      },
    ),
    create: mock(async (data: Record<string, unknown>) => ({
      id: 'new-id',
      ...data,
      passwordHash: 'generated-hash',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    })),
    update: mock(async (id: string, data: Record<string, unknown>) => ({
      ...rows[id],
      ...data,
      updatedAt: '2024-01-02',
    })),
    delete: mock(async (id: string) => rows[id] ?? null),
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

        const result = unwrap(await handlers.list!(ctx));

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

        const result = unwrap(await handlers.get!(ctx, 'user-1'));

        expect(result.status).toBe(200);
        expect(result.body).toHaveProperty('email', 'alice@example.com');
        expect(result.body).not.toHaveProperty('passwordHash');
      });
    });

    describe('When getting a non-existent record', () => {
      it('Then throws EntityNotFoundError', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = await handlers.get!(ctx, 'nonexistent');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBeInstanceOf(EntityNotFoundError);
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

        const result = unwrap(await handlers.create!(ctx, {
          email: 'new@example.com',
          name: 'New',
          createdAt: 'should-be-stripped',
          id: 'should-be-stripped',
        }));

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

        unwrap(await handlers.create!(ctx, { email: 'a@b.com', name: 'Test' }));

        const createCall = db.create.mock.calls[0]![0];
        expect(createCall).toHaveProperty('createdBy', 'user-1');
      });
    });
  });

  // --- After hooks ---

  describe('Given an entity with after.create hook', () => {
    const afterSpy = mock();
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

        unwrap(await handlers.create!(ctx, { email: 'a@b.com', name: 'Test' }));

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

        const result = unwrap(await handlers.update!(ctx, 'user-1', {
          name: 'Updated',
          createdAt: 'should-be-stripped',
        }));

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

        unwrap(await handlers.update!(ctx, 'user-1', { name: 'Updated' }));

        const updateCall = db.update.mock.calls[0]![1];
        expect(updateCall).toHaveProperty('updatedBy', 'user-1');
      });
    });
  });

  describe('Given an entity with after.update hook', () => {
    const afterUpdateSpy = mock();
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

        unwrap(await handlers.update!(ctx, 'user-1', { name: 'Updated' }));

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

        const result = unwrap(await handlers.delete!(ctx, 'user-1'));

        expect(result.status).toBe(204);
        expect(result.body).toBeNull();
        expect(db.delete).toHaveBeenCalledWith('user-1');
      });
    });
  });

  describe('Given an entity with after.delete hook', () => {
    const afterDeleteSpy = mock();
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

        unwrap(await handlers.delete!(ctx, 'user-1'));

        expect(afterDeleteSpy).toHaveBeenCalledOnce();
        expect(afterDeleteSpy.mock.calls[0]![0]).toHaveProperty('id', 'user-1');
        // Hidden fields must be stripped to prevent data leakage
        expect(afterDeleteSpy.mock.calls[0]![0]).not.toHaveProperty('passwordHash');
      });
    });
  });

  // --- Pagination ---

  describe('Given an entity with open list access and 2 rows', () => {
    const def = entity('users', {
      model: usersModel,
      access: { list: () => true },
    });

    describe('When calling list() with no options', () => {
      it('Then returns all rows with default pagination metadata', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.list(ctx));

        expect(result.status).toBe(200);
        expect(result.body.data).toHaveLength(2);
        expect(result.body.total).toBe(2);
        expect(result.body.limit).toBe(20);
        // All rows fit in one page → no next page
        expect(result.body.nextCursor).toBeNull();
        expect(result.body.hasNextPage).toBe(false);
      });
    });

    describe('When calling list() with limit=1', () => {
      it('Then returns at most 1 row with nextCursor', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.list(ctx, { limit: 1 }));

        expect(result.body.data).toHaveLength(1);
        expect(result.body.total).toBe(2);
        expect(result.body.limit).toBe(1);
        // Full page returned → nextCursor points to last row
        expect(result.body.nextCursor).toBe('user-1');
        expect(result.body.hasNextPage).toBe(true);
      });
    });
  });

  // --- Pagination edge cases ---

  describe('Given an entity with open list access (pagination edge cases)', () => {
    const def = entity('users', {
      model: usersModel,
      access: { list: () => true },
    });

    describe('When calling list() with negative limit', () => {
      it('Then clamps limit to 0', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.list(ctx, { limit: -5 }));

        expect(result.body.data).toHaveLength(0);
        expect(result.body.limit).toBe(0);
        expect(result.body.total).toBe(2);
      });
    });

    describe('When calling list() with limit=0', () => {
      it('Then returns empty data with correct total', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.list(ctx, { limit: 0 }));

        expect(result.body.data).toHaveLength(0);
        expect(result.body.limit).toBe(0);
        expect(result.body.total).toBe(2);
      });
    });

    describe('When calling list() with an after value exceeding 512 chars', () => {
      it('Then ignores the invalid cursor and returns all rows', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const longCursor = 'x'.repeat(513);
        const result = unwrap(await handlers.list(ctx, { after: longCursor }));

        // Invalid cursor ignored — returns all rows as if no cursor
        expect(result.body.data).toHaveLength(2);
        expect(result.body.total).toBe(2);
      });
    });

    describe('When calling list() with an empty string after', () => {
      it('Then ignores the empty cursor and returns all rows', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.list(ctx, { after: '' }));

        // Empty string is falsy — treated as no cursor
        expect(result.body.data).toHaveLength(2);
        expect(result.body.total).toBe(2);
      });
    });
  });

  // --- Cursor-based pagination ---

  describe('Given an entity with open list access (cursor pagination)', () => {
    const def = entity('users', {
      model: usersModel,
      access: { list: () => true },
    });

    describe('When calling list() with limit=1 (first page)', () => {
      it('Then returns nextCursor pointing to the last row id', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.list(ctx, { limit: 1 }));

        expect(result.body.data).toHaveLength(1);
        expect(result.body.nextCursor).toBe('user-1');
      });
    });

    describe('When calling list() with after=user-1 and limit=1', () => {
      it('Then returns the next row after the cursor', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.list(ctx, { after: 'user-1', limit: 1 }));

        expect(result.body.data).toHaveLength(1);
        expect(result.body.data[0]).toHaveProperty('email', 'bob@example.com');
        expect(result.body.nextCursor).toBe('user-2');
        expect(result.body.hasNextPage).toBe(true);
      });
    });

    describe('When calling list() with after=user-2 (last item)', () => {
      it('Then returns empty data with null nextCursor', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.list(ctx, { after: 'user-2' }));

        expect(result.body.data).toHaveLength(0);
        expect(result.body.nextCursor).toBeNull();
        expect(result.body.hasNextPage).toBe(false);
      });
    });

    describe('When calling list() that returns all rows (no more pages)', () => {
      it('Then nextCursor is null', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.list(ctx));

        // Default limit=20 > 2 rows, so all rows returned
        expect(result.body.data).toHaveLength(2);
        expect(result.body.nextCursor).toBeNull();
        expect(result.body.hasNextPage).toBe(false);
      });
    });

    describe('When calling list() with after + where filter (M2)', () => {
      it('Then filters first, then applies cursor within filtered set', async () => {
        // Custom DB with 3 viewers to test cursor within filtered results
        const rows: Record<string, Record<string, unknown>> = {
          'user-1': {
            id: 'user-1',
            email: 'alice@example.com',
            name: 'Alice',
            passwordHash: 'h1',
            role: 'viewer',
          },
          'user-2': {
            id: 'user-2',
            email: 'bob@example.com',
            name: 'Bob',
            passwordHash: 'h2',
            role: 'admin',
          },
          'user-3': {
            id: 'user-3',
            email: 'charlie@example.com',
            name: 'Charlie',
            passwordHash: 'h3',
            role: 'viewer',
          },
        };
        const db = {
          get: mock(async (id: string) => rows[id] ?? null),
          list: mock(
            async (options?: {
              where?: Record<string, unknown>;
              limit?: number;
              after?: string;
            }) => {
              let result = Object.values(rows);
              const where = options?.where;
              if (where) {
                result = result.filter((row) =>
                  Object.entries(where).every(([key, value]) => row[key] === value),
                );
              }
              const total = result.length;
              if (options?.after) {
                const afterIdx = result.findIndex((r) => r.id === options.after);
                result = afterIdx >= 0 ? result.slice(afterIdx + 1) : [];
              }
              if (options?.limit !== undefined) {
                result = result.slice(0, options.limit);
              }
              return { data: result, total };
            },
          ),
          create: mock(async (data: Record<string, unknown>) => data),
          update: mock(async (_id: string, data: Record<string, unknown>) => data),
          delete: mock(async () => null),
        };
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        // Filter to viewers (user-1, user-3), cursor after user-1
        const result = unwrap(await handlers.list(ctx, {
          where: { role: 'viewer' },
          after: 'user-1',
          limit: 10,
        }));

        // user-2 filtered out (admin), user-1 is before cursor → only user-3
        expect(result.body.data).toHaveLength(1);
        expect(result.body.data[0]).toHaveProperty('name', 'Charlie');
        expect(result.body.total).toBe(2); // 2 viewers total
        expect(result.body.nextCursor).toBeNull(); // only 1 row, limit=10
        expect(result.body.hasNextPage).toBe(false);
      });
    });

    describe('Full cursor walkthrough (M4): page through all rows', () => {
      it('Then iterates page 1 → nextCursor → page 2 → null cursor', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        // Page 1
        const page1 = unwrap(await handlers.list(ctx, { limit: 1 }));
        expect(page1.body.data).toHaveLength(1);
        expect(page1.body.data[0]).toHaveProperty('email', 'alice@example.com');
        expect(page1.body.nextCursor).toBe('user-1');
        expect(page1.body.hasNextPage).toBe(true);

        // Page 2 — use nextCursor from page 1
        const page2 = unwrap(await handlers.list(ctx, {
          after: page1.body.nextCursor!,
          limit: 1,
        }));
        expect(page2.body.data).toHaveLength(1);
        expect(page2.body.data[0]).toHaveProperty('email', 'bob@example.com');
        expect(page2.body.nextCursor).toBe('user-2');
        expect(page2.body.hasNextPage).toBe(true);

        // Page 3 — use nextCursor from page 2 (should be empty)
        const page3 = unwrap(await handlers.list(ctx, {
          after: page2.body.nextCursor!,
          limit: 1,
        }));
        expect(page3.body.data).toHaveLength(0);
        expect(page3.body.nextCursor).toBeNull();
        expect(page3.body.hasNextPage).toBe(false);
      });
    });
  });

  // --- Filtering ---

  describe('Given an entity with open list access and rows with different roles', () => {
    const def = entity('users', {
      model: usersModel,
      access: { list: () => true },
    });

    describe('When calling list() with where: { role: "admin" }', () => {
      it('Then returns only matching rows', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.list(ctx, { where: { role: 'admin' } }));

        expect(result.body.data).toHaveLength(1);
        expect(result.body.data[0]).toHaveProperty('role', 'admin');
        expect(result.body.total).toBe(1);
      });
    });

    describe('When calling list() with where on a hidden field (passwordHash)', () => {
      it('Then strips the hidden field from where and returns all rows', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.list(ctx, { where: { passwordHash: 'hash123' } }));

        // Hidden field is stripped from where — no filtering occurs
        expect(result.body.data).toHaveLength(2);
        expect(result.body.total).toBe(2);
      });
    });

    describe('When calling list() with mixed where (valid + hidden field)', () => {
      it('Then filters only by the non-hidden field', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.list(ctx, {
          where: { role: 'admin', passwordHash: 'hash123' },
        }));

        // passwordHash stripped, only role filter applied
        expect(result.body.data).toHaveLength(1);
        expect(result.body.data[0]).toHaveProperty('role', 'admin');
        expect(result.body.total).toBe(1);
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

        const result = unwrap(await handlers.create!(ctx, { email: 'a@b.com', name: 'Test' }));

        expect(result.status).toBe(201);
      });
    });
  });
});
