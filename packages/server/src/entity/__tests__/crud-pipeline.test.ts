import { describe, expect, it, mock } from 'bun:test';
import { d } from '@vertz/db';
import { EntityForbiddenError, EntityNotFoundError, unwrap } from '@vertz/errors';
import { InMemoryClosureStore } from '../../auth/closure-store';
import { defineAccess } from '../../auth/define-access';
import { InMemoryRoleAssignmentStore } from '../../auth/role-assignment-store';
import { rules } from '../../auth/rules';
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
  passwordHash: d.text().is('hidden'),
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

  /** Checks if a row matches all where conditions. */
  function matchesWhere(row: Record<string, unknown>, where?: Record<string, unknown>): boolean {
    if (!where) return true;
    return Object.entries(where).every(([key, value]) => {
      if (typeof value === 'object' && value !== null && 'in' in value) {
        return (value as { in: unknown[] }).in.includes(row[key]);
      }
      return row[key] === value;
    });
  }

  return {
    get: mock(
      async (id: string, options?: { where?: Record<string, unknown>; include?: unknown }) => {
        const row = rows[id] ?? null;
        if (!row) return null;
        // Apply additional where conditions (Phase 2: access where pushed to DB)
        if (options?.where && !matchesWhere(row, options.where)) return null;
        return row;
      },
    ),
    list: mock(
      async (options?: { where?: Record<string, unknown>; limit?: number; after?: string }) => {
        let result = Object.values(rows);
        const where = options?.where;
        if (where) {
          result = result.filter((row) => matchesWhere(row, where));
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
    update: mock(
      async (
        id: string,
        data: Record<string, unknown>,
        options?: { where?: Record<string, unknown> },
      ) => {
        const row = rows[id];
        // Defense-in-depth: if where conditions don't match, throw (simulates DB RETURNING nothing)
        if (row && options?.where && !matchesWhere(row, options.where)) {
          throw new Error('Update matched 0 rows');
        }
        return {
          ...row,
          ...data,
          updatedAt: '2024-01-02',
        };
      },
    ),
    delete: mock(async (id: string, options?: { where?: Record<string, unknown> }) => {
      const row = rows[id];
      // Defense-in-depth: if where conditions don't match, throw
      if (row && options?.where && !matchesWhere(row, options.where)) {
        throw new Error('Delete matched 0 rows');
      }
      return row ?? null;
    }),
  };
}

function makeCtx(
  overrides: { userId?: string | null; tenantId?: string | null; roles?: string[] } = {},
) {
  const registry = new EntityRegistry();
  return createEntityContext(
    {
      userId: 'userId' in overrides ? overrides.userId : 'user-1',
      tenantId: overrides.tenantId ?? null,
      roles: overrides.roles ?? [],
    },
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
        expect(result.body.items).toHaveLength(2);
        // Hidden fields stripped
        for (const record of result.body.items) {
          expect(record).not.toHaveProperty('passwordHash');
        }
        // Non-hidden fields present
        expect(result.body.items[0]).toHaveProperty('email');
      });
    });

    describe('When an unauthenticated user calls list', () => {
      it('Then returns err(EntityForbiddenError)', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ userId: null });

        const result = await handlers.list!(ctx);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBeInstanceOf(EntityForbiddenError);
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

        const result = unwrap(
          await handlers.create!(ctx, {
            email: 'new@example.com',
            name: 'New',
            createdAt: 'should-be-stripped',
            id: 'should-be-stripped',
          }),
        );

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
      it('Then returns err(EntityForbiddenError)', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ roles: ['viewer'] });

        const result = await handlers.create!(ctx, { email: 'new@example.com', name: 'New' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBeInstanceOf(EntityForbiddenError);
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

        const result = unwrap(
          await handlers.update!(ctx, 'user-1', {
            name: 'Updated',
            createdAt: 'should-be-stripped',
          }),
        );

        expect(result.status).toBe(200);
        expect(result.body).not.toHaveProperty('passwordHash');
        const updateCall = db.update.mock.calls[0]![1];
        expect(updateCall).not.toHaveProperty('createdAt');
        expect(updateCall).toHaveProperty('name', 'Updated');
      });
    });

    describe('When a non-owner updates the record', () => {
      it('Then returns err(EntityForbiddenError)', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ userId: 'user-2' });

        const result = await handlers.update!(ctx, 'user-1', { name: 'Hacked' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBeInstanceOf(EntityForbiddenError);
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
        expect(db.delete.mock.calls[0]![0]).toBe('user-1');
        // No where conditions for function-based access rules
        expect(db.delete.mock.calls[0]![1]).toBeUndefined();
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

  // --- Expose select ---

  describe('Given an entity with expose.select restricting to id and name', () => {
    const def = entity('users', {
      model: usersModel,
      access: { list: () => true, get: () => true, create: () => true, update: () => true },
      expose: {
        select: { id: true, name: true },
      },
    });

    describe('When listing records', () => {
      it('Then response only contains fields from expose.select', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.list(ctx));

        expect(result.body.items).toHaveLength(2);
        for (const record of result.body.items) {
          expect(Object.keys(record).sort()).toEqual(['id', 'name']);
        }
      });
    });

    describe('When getting a record', () => {
      it('Then response only contains fields from expose.select', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.get(ctx, 'user-1'));

        expect(Object.keys(result.body).sort()).toEqual(['id', 'name']);
      });
    });

    describe('When creating a record', () => {
      it('Then response only contains fields from expose.select', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(
          await handlers.create(ctx, { email: 'new@example.com', name: 'New' }),
        );

        expect(Object.keys(result.body).sort()).toEqual(['id', 'name']);
      });
    });

    describe('When updating a record', () => {
      it('Then response only contains fields from expose.select', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.update(ctx, 'user-1', { name: 'Updated' }));

        expect(Object.keys(result.body).sort()).toEqual(['id', 'name']);
      });
    });
  });

  describe('Given an entity without expose config', () => {
    const def = entity('users', {
      model: usersModel,
      access: { list: () => true },
    });

    describe('When listing records', () => {
      it('Then response contains all non-hidden fields (backwards compatible)', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.list(ctx));

        for (const record of result.body.items) {
          // Should have all fields except hidden ones
          expect(record).toHaveProperty('email');
          expect(record).toHaveProperty('role');
          expect(record).toHaveProperty('createdAt');
          expect(record).not.toHaveProperty('passwordHash');
        }
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
        expect(result.body.items).toHaveLength(2);
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

        expect(result.body.items).toHaveLength(1);
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

        expect(result.body.items).toHaveLength(0);
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

        expect(result.body.items).toHaveLength(0);
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
        expect(result.body.items).toHaveLength(2);
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
        expect(result.body.items).toHaveLength(2);
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

        expect(result.body.items).toHaveLength(1);
        expect(result.body.nextCursor).toBe('user-1');
      });
    });

    describe('When calling list() with after=user-1 and limit=1', () => {
      it('Then returns the next row after the cursor', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.list(ctx, { after: 'user-1', limit: 1 }));

        expect(result.body.items).toHaveLength(1);
        expect(result.body.items[0]).toHaveProperty('email', 'bob@example.com');
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

        expect(result.body.items).toHaveLength(0);
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
        expect(result.body.items).toHaveLength(2);
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
        const result = unwrap(
          await handlers.list(ctx, {
            where: { role: 'viewer' },
            after: 'user-1',
            limit: 10,
          }),
        );

        // user-2 filtered out (admin), user-1 is before cursor → only user-3
        expect(result.body.items).toHaveLength(1);
        expect(result.body.items[0]).toHaveProperty('name', 'Charlie');
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
        expect(page1.body.items).toHaveLength(1);
        expect(page1.body.items[0]).toHaveProperty('email', 'alice@example.com');
        expect(page1.body.nextCursor).toBe('user-1');
        expect(page1.body.hasNextPage).toBe(true);

        // Page 2 — use nextCursor from page 1
        const page2 = unwrap(
          await handlers.list(ctx, {
            after: page1.body.nextCursor!,
            limit: 1,
          }),
        );
        expect(page2.body.items).toHaveLength(1);
        expect(page2.body.items[0]).toHaveProperty('email', 'bob@example.com');
        expect(page2.body.nextCursor).toBe('user-2');
        expect(page2.body.hasNextPage).toBe(true);

        // Page 3 — use nextCursor from page 2 (should be empty)
        const page3 = unwrap(
          await handlers.list(ctx, {
            after: page2.body.nextCursor!,
            limit: 1,
          }),
        );
        expect(page3.body.items).toHaveLength(0);
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

        expect(result.body.items).toHaveLength(1);
        expect(result.body.items[0]).toHaveProperty('role', 'admin');
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
        expect(result.body.items).toHaveLength(2);
        expect(result.body.total).toBe(2);
      });
    });

    describe('When calling list() with mixed where (valid + hidden field)', () => {
      it('Then filters only by the non-hidden field', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(
          await handlers.list(ctx, {
            where: { role: 'admin', passwordHash: 'hash123' },
          }),
        );

        // passwordHash stripped, only role filter applied
        expect(result.body.items).toHaveLength(1);
        expect(result.body.items[0]).toHaveProperty('role', 'admin');
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
      it('Then returns err(EntityForbiddenError) with "disabled" message', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = await handlers.delete!(ctx, 'user-1');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
          expect(result.error.message).toContain('disabled');
        }
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
      it('Then returns err(EntityForbiddenError)', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = await handlers.create!(ctx, { email: 'a@b.com', name: 'New' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBeInstanceOf(EntityForbiddenError);
      });
    });
  });

  // --- No access rules → no handlers ---

  describe('Given an entity with no access rules', () => {
    const def = entity('users', { model: usersModel });

    describe('When building CRUD handlers', () => {
      it('Then all handlers return err(EntityForbiddenError) (deny by default)', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        for (const result of [
          await handlers.list!(ctx),
          await handlers.get!(ctx, 'user-1'),
          await handlers.create!(ctx, {}),
          await handlers.update!(ctx, 'user-1', {}),
          await handlers.delete!(ctx, 'user-1'),
        ]) {
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });
  });

  // --- Relation field narrowing ---

  describe('Given an entity with expose.include: { creator: { select: { id: true, name: true } } }', () => {
    const tasksTable = d.table('tasks', {
      id: d.uuid().primary(),
      title: d.text(),
    });
    const tasksModel = d.model(tasksTable);
    const def = entity('tasks', {
      model: tasksModel,
      access: { list: () => true, get: () => true },
      expose: {
        select: { id: true, title: true },
        include: { creator: { select: { id: true, name: true } } },
      },
    });

    function createTaskDbWithRelations() {
      const rows: Record<string, Record<string, unknown>> = {
        'task-1': {
          id: 'task-1',
          title: 'Review PR',
          creator: { id: 'u1', name: 'Alice', email: 'alice@example.com', role: 'admin' },
        },
      };
      return {
        get: mock(async (id: string) => rows[id] ?? null),
        list: mock(async () => ({
          data: Object.values(rows),
          total: Object.values(rows).length,
        })),
        create: mock(async (data: Record<string, unknown>) => data),
        update: mock(async (_id: string, data: Record<string, unknown>) => data),
        delete: mock(async () => null),
      };
    }

    describe('When list returns rows with full creator data', () => {
      it('Then the response narrows creator to only id and name', async () => {
        const db = createTaskDbWithRelations();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.list(ctx));

        expect(result.body.items[0]).toHaveProperty('title', 'Review PR');
        const creator = result.body.items[0].creator as Record<string, unknown>;
        expect(creator).toEqual({ id: 'u1', name: 'Alice' });
        // email and role should be stripped
        expect(creator).not.toHaveProperty('email');
        expect(creator).not.toHaveProperty('role');
      });
    });

    describe('When get returns a row with full creator data', () => {
      it('Then the response narrows creator to only id and name', async () => {
        const db = createTaskDbWithRelations();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.get(ctx, 'task-1'));

        expect(result.body).toHaveProperty('title', 'Review PR');
        const creator = result.body.creator as Record<string, unknown>;
        expect(creator).toEqual({ id: 'u1', name: 'Alice' });
        expect(creator).not.toHaveProperty('email');
      });
    });
  });

  describe('Given an entity with expose.include: { project: false }', () => {
    const tasksTable = d.table('tasks', {
      id: d.uuid().primary(),
      title: d.text(),
    });
    const tasksModel = d.model(tasksTable);
    const def = entity('tasks', {
      model: tasksModel,
      access: { list: () => true, get: () => true },
      expose: { select: { id: true, title: true }, include: { project: false } },
    });

    function createTaskDbWithProject() {
      const rows: Record<string, Record<string, unknown>> = {
        'task-1': {
          id: 'task-1',
          title: 'Review PR',
          project: { id: 'p1', name: 'Acme', budget: 100000 },
        },
      };
      return {
        get: mock(async (id: string) => rows[id] ?? null),
        list: mock(async () => ({
          data: Object.values(rows),
          total: Object.values(rows).length,
        })),
        create: mock(async (data: Record<string, unknown>) => data),
        update: mock(async (_id: string, data: Record<string, unknown>) => data),
        delete: mock(async () => null),
      };
    }

    describe('When list returns rows with project data', () => {
      it('Then the project relation is stripped from the response', async () => {
        const db = createTaskDbWithProject();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.list(ctx));

        expect(result.body.items[0]).toHaveProperty('title', 'Review PR');
        expect(result.body.items[0]).not.toHaveProperty('project');
      });
    });

    describe('When get returns a row with project data', () => {
      it('Then the project relation is stripped from the response', async () => {
        const db = createTaskDbWithProject();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.get(ctx, 'task-1'));

        expect(result.body).toHaveProperty('title', 'Review PR');
        expect(result.body).not.toHaveProperty('project');
      });
    });
  });

  // --- Tenant scoping ---

  describe('Given a tenant-scoped entity (tenantId column in model)', () => {
    const tasksTable = d.table('tasks', {
      id: d.uuid().primary(),
      title: d.text(),
      tenantId: d.uuid(),
    });
    const tasksModel = d.model(tasksTable);
    const def = entity('tasks', {
      model: tasksModel,
      access: {
        list: () => true,
        get: () => true,
        create: () => true,
        update: () => true,
        delete: () => true,
      },
    });

    function createTenantStubDb() {
      const rows: Record<string, Record<string, unknown>> = {
        'task-1': { id: 'task-1', title: 'Task A', tenantId: 'tenant-a' },
        'task-2': { id: 'task-2', title: 'Task B', tenantId: 'tenant-b' },
        'task-3': { id: 'task-3', title: 'Task C', tenantId: 'tenant-a' },
      };

      function matchesWhere(
        row: Record<string, unknown>,
        where?: Record<string, unknown>,
      ): boolean {
        if (!where) return true;
        return Object.entries(where).every(([key, value]) => {
          if (typeof value === 'object' && value !== null && 'in' in value) {
            return (value as { in: unknown[] }).in.includes(row[key]);
          }
          return row[key] === value;
        });
      }

      return {
        get: mock(async (id: string, options?: { where?: Record<string, unknown> }) => {
          const row = rows[id] ?? null;
          if (!row) return null;
          if (options?.where && !matchesWhere(row, options.where)) return null;
          return row;
        }),
        list: mock(
          async (options?: { where?: Record<string, unknown>; limit?: number; after?: string }) => {
            let result = Object.values(rows);
            const where = options?.where;
            if (where) {
              result = result.filter((row) => matchesWhere(row, where));
            }
            const total = result.length;
            if (options?.limit !== undefined) {
              result = result.slice(0, options.limit);
            }
            return { data: result, total };
          },
        ),
        create: mock(async (data: Record<string, unknown>) => ({
          id: 'new-id',
          ...data,
        })),
        update: mock(
          async (
            id: string,
            data: Record<string, unknown>,
            options?: { where?: Record<string, unknown> },
          ) => {
            const row = rows[id];
            if (row && options?.where && !matchesWhere(row, options.where)) {
              throw new Error('Update matched 0 rows');
            }
            return { ...row, ...data };
          },
        ),
        delete: mock(async (id: string, options?: { where?: Record<string, unknown> }) => {
          const row = rows[id];
          if (row && options?.where && !matchesWhere(row, options.where)) {
            throw new Error('Delete matched 0 rows');
          }
          return row ?? null;
        }),
      };
    }

    describe('When tenant-a user calls list()', () => {
      it('Then only returns tasks for tenant-a', async () => {
        const db = createTenantStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ tenantId: 'tenant-a' });

        const result = unwrap(await handlers.list(ctx));

        expect(result.body.items).toHaveLength(2);
        for (const item of result.body.items) {
          expect(item.tenantId).toBe('tenant-a');
        }
      });
    });

    describe('When tenant-a user calls get() for tenant-b task', () => {
      it('Then returns 404 (not 403)', async () => {
        const db = createTenantStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ tenantId: 'tenant-a' });

        const result = await handlers.get(ctx, 'task-2');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityNotFoundError);
        }
      });
    });

    describe('When tenant-a user calls get() for tenant-a task', () => {
      it('Then returns the task', async () => {
        const db = createTenantStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ tenantId: 'tenant-a' });

        const result = unwrap(await handlers.get(ctx, 'task-1'));
        expect(result.body.tenantId).toBe('tenant-a');
      });
    });

    describe('When tenant-a user calls create()', () => {
      it('Then auto-sets tenantId from context', async () => {
        const db = createTenantStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ tenantId: 'tenant-a' });

        unwrap(await handlers.create(ctx, { title: 'New Task' }));

        const createCall = db.create.mock.calls[0]![0];
        expect(createCall).toHaveProperty('tenantId', 'tenant-a');
      });
    });

    describe('When tenant-a user calls update() on tenant-b task', () => {
      it('Then returns 404 (not 403)', async () => {
        const db = createTenantStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ tenantId: 'tenant-a' });

        const result = await handlers.update(ctx, 'task-2', { title: 'Hacked' });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityNotFoundError);
        }
      });
    });

    describe('When tenant-a user calls delete() on tenant-b task', () => {
      it('Then returns 404 (not 403)', async () => {
        const db = createTenantStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ tenantId: 'tenant-a' });

        const result = await handlers.delete(ctx, 'task-2');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityNotFoundError);
        }
      });
    });
  });

  describe('Given a tenant-scoped entity with custom FK column (workspaceId)', () => {
    const workspacesTable = d
      .table('workspaces', {
        id: d.uuid().primary(),
        name: d.text(),
      })
      .tenant();
    const projectsTable = d.table('projects', {
      id: d.uuid().primary(),
      title: d.text(),
      workspaceId: d.uuid(),
    });
    const projectsModel = d.model(projectsTable, {
      workspace: d.ref.one(() => workspacesTable, 'workspaceId'),
    });
    const def = entity('projects', {
      model: projectsModel,
      access: {
        list: () => true,
        get: () => true,
        create: () => true,
        update: () => true,
        delete: () => true,
      },
    });

    function createCustomTenantStubDb() {
      const rows: Record<string, Record<string, unknown>> = {
        'proj-1': { id: 'proj-1', title: 'Proj A', workspaceId: 'ws-a' },
        'proj-2': { id: 'proj-2', title: 'Proj B', workspaceId: 'ws-b' },
        'proj-3': { id: 'proj-3', title: 'Proj C', workspaceId: 'ws-a' },
      };

      function matchesWhere(
        row: Record<string, unknown>,
        where?: Record<string, unknown>,
      ): boolean {
        if (!where) return true;
        return Object.entries(where).every(([key, value]) => {
          if (typeof value === 'object' && value !== null && 'in' in value) {
            return (value as { in: unknown[] }).in.includes(row[key]);
          }
          return row[key] === value;
        });
      }

      return {
        get: mock(async (id: string, options?: { where?: Record<string, unknown> }) => {
          const row = rows[id] ?? null;
          if (!row) return null;
          if (options?.where && !matchesWhere(row, options.where)) return null;
          return row;
        }),
        list: mock(
          async (options?: { where?: Record<string, unknown>; limit?: number; after?: string }) => {
            let result = Object.values(rows);
            const where = options?.where;
            if (where) {
              result = result.filter((row) => matchesWhere(row, where));
            }
            const total = result.length;
            if (options?.limit !== undefined) {
              result = result.slice(0, options.limit);
            }
            return { data: result, total };
          },
        ),
        create: mock(async (data: Record<string, unknown>) => ({
          id: 'new-id',
          ...data,
        })),
        update: mock(
          async (
            id: string,
            data: Record<string, unknown>,
            options?: { where?: Record<string, unknown> },
          ) => {
            const row = rows[id];
            if (row && options?.where && !matchesWhere(row, options.where)) {
              throw new Error('Update matched 0 rows');
            }
            return { ...row, ...data };
          },
        ),
        delete: mock(async (id: string, options?: { where?: Record<string, unknown> }) => {
          const row = rows[id];
          if (row && options?.where && !matchesWhere(row, options.where)) {
            throw new Error('Delete matched 0 rows');
          }
          return row ?? null;
        }),
      };
    }

    describe('When ws-a user calls list()', () => {
      it('Then only returns projects for ws-a (filters by workspaceId)', async () => {
        const db = createCustomTenantStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ tenantId: 'ws-a' });

        const result = unwrap(await handlers.list(ctx));

        expect(result.body.items).toHaveLength(2);
        for (const item of result.body.items) {
          expect(item.workspaceId).toBe('ws-a');
        }
      });
    });

    describe('When ws-a user calls get() for ws-b project', () => {
      it('Then returns 404 (cross-tenant)', async () => {
        const db = createCustomTenantStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ tenantId: 'ws-a' });

        const result = await handlers.get(ctx, 'proj-2');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityNotFoundError);
        }
      });
    });

    describe('When ws-a user calls create()', () => {
      it('Then auto-sets workspaceId from context', async () => {
        const db = createCustomTenantStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ tenantId: 'ws-a' });

        unwrap(await handlers.create(ctx, { title: 'New Project' }));

        const createCall = db.create.mock.calls[0]![0];
        expect(createCall).toHaveProperty('workspaceId', 'ws-a');
        expect(createCall).not.toHaveProperty('tenantId');
      });
    });

    describe('When ws-a user calls update() on ws-b project', () => {
      it('Then returns 404 (cross-tenant)', async () => {
        const db = createCustomTenantStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ tenantId: 'ws-a' });

        const result = await handlers.update(ctx, 'proj-2', { title: 'Hacked' });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityNotFoundError);
        }
      });
    });

    describe('When ws-a user calls delete() on ws-b project', () => {
      it('Then returns 404 (cross-tenant)', async () => {
        const db = createCustomTenantStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ tenantId: 'ws-a' });

        const result = await handlers.delete(ctx, 'proj-2');
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityNotFoundError);
        }
      });
    });
  });

  describe('Given a non-tenant-scoped entity (no tenantId column)', () => {
    describe('When calling list() without tenantId in context', () => {
      it('Then returns all rows (no tenant filter)', async () => {
        const def = entity('users', {
          model: usersModel,
          access: { list: () => true },
        });
        const db = createStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        const result = unwrap(await handlers.list(ctx));
        expect(result.body.items).toHaveLength(2);
      });
    });
  });

  describe('Given an entity with tenantScoped: false override', () => {
    const tasksTable = d.table('admin-tasks', {
      id: d.uuid().primary(),
      title: d.text(),
      tenantId: d.uuid(),
    });
    const tasksModel = d.model(tasksTable);
    const def = entity('admin-tasks', {
      model: tasksModel,
      tenantScoped: false,
      access: { list: () => true },
    });

    describe('When calling list() with tenantId in context', () => {
      it('Then returns all rows (no tenant filter)', async () => {
        const rows: Record<string, Record<string, unknown>> = {
          'task-1': { id: 'task-1', title: 'Task A', tenantId: 'tenant-a' },
          'task-2': { id: 'task-2', title: 'Task B', tenantId: 'tenant-b' },
        };
        const db = {
          get: mock(async (id: string) => rows[id] ?? null),
          list: mock(async () => ({ data: Object.values(rows), total: 2 })),
          create: mock(async (data: Record<string, unknown>) => data),
          update: mock(async (_id: string, data: Record<string, unknown>) => data),
          delete: mock(async () => null),
        };
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ tenantId: 'tenant-a' });

        const result = unwrap(await handlers.list(ctx));
        expect(result.body.items).toHaveLength(2);
      });
    });
  });

  // --- rules.where() pushed to DB query ---

  describe('Given an entity with access: { list: rules.where({ status: "published" }) }', () => {
    const postsTable = d.table('posts', {
      id: d.uuid().primary(),
      title: d.text(),
      status: d.text(),
      createdAt: d.timestamp().default('now').readOnly(),
    });
    const postsModel = d.model(postsTable);

    const def = entity('posts', {
      model: postsModel,
      access: { list: rules.where({ status: 'published' }) },
    });

    describe('When list is called', () => {
      it('Then the static where conditions are merged into the DB query', async () => {
        const db = {
          get: mock(async () => null),
          list: mock(async () => ({ data: [], total: 0 })),
          create: mock(async (data: Record<string, unknown>) => data),
          update: mock(async (_id: string, data: Record<string, unknown>) => data),
          delete: mock(async () => null),
        };
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx();

        await handlers.list(ctx);

        // Verify the where clause passed to db.list contains the static conditions
        expect(db.list).toHaveBeenCalledTimes(1);
        const callArgs = db.list.mock.calls[0][0] as { where?: Record<string, unknown> };
        expect(callArgs.where).toEqual(expect.objectContaining({ status: 'published' }));
      });
    });
  });

  describe('Given an entity with access: { list: rules.where({ createdBy: rules.user.id }) }', () => {
    const postsTable = d.table('posts', {
      id: d.uuid().primary(),
      title: d.text(),
      createdBy: d.text(),
      createdAt: d.timestamp().default('now').readOnly(),
    });
    const postsModel = d.model(postsTable);

    const def = entity('posts', {
      model: postsModel,
      access: { list: rules.where({ createdBy: rules.user.id }) },
    });

    describe('When list is called by an authenticated user', () => {
      it('Then user markers are resolved and merged into the DB query', async () => {
        const db = {
          get: mock(async () => null),
          list: mock(async () => ({ data: [], total: 0 })),
          create: mock(async (data: Record<string, unknown>) => data),
          update: mock(async (_id: string, data: Record<string, unknown>) => data),
          delete: mock(async () => null),
        };
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ userId: 'user-42' });

        await handlers.list(ctx);

        expect(db.list).toHaveBeenCalledTimes(1);
        const callArgs = db.list.mock.calls[0][0] as { where?: Record<string, unknown> };
        expect(callArgs.where).toEqual(expect.objectContaining({ createdBy: 'user-42' }));
      });
    });
  });

  describe('Given an entity with access: { list: rules.all(rules.authenticated(), rules.where(...)) }', () => {
    const postsTable = d.table('posts', {
      id: d.uuid().primary(),
      title: d.text(),
      createdBy: d.text(),
      createdAt: d.timestamp().default('now').readOnly(),
    });
    const postsModel = d.model(postsTable);

    const def = entity('posts', {
      model: postsModel,
      access: {
        list: rules.all(rules.authenticated(), rules.where({ createdBy: rules.user.id })),
      },
    });

    describe('When an authenticated user calls list', () => {
      it('Then where conditions are extracted from the all() composition', async () => {
        const db = {
          get: mock(async () => null),
          list: mock(async () => ({ data: [], total: 0 })),
          create: mock(async (data: Record<string, unknown>) => data),
          update: mock(async (_id: string, data: Record<string, unknown>) => data),
          delete: mock(async () => null),
        };
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ userId: 'user-99' });

        await handlers.list(ctx);

        expect(db.list).toHaveBeenCalledTimes(1);
        const callArgs = db.list.mock.calls[0][0] as { where?: Record<string, unknown> };
        expect(callArgs.where).toEqual(expect.objectContaining({ createdBy: 'user-99' }));
      });
    });

    describe('When an unauthenticated user calls list', () => {
      it('Then access is denied (authenticated rule still enforced)', async () => {
        const db = {
          get: mock(async () => null),
          list: mock(async () => ({ data: [], total: 0 })),
          create: mock(async (data: Record<string, unknown>) => data),
          update: mock(async (_id: string, data: Record<string, unknown>) => data),
          delete: mock(async () => null),
        };
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ userId: null });

        const result = await handlers.list(ctx);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
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

  // --- Indirect tenant scoping ---

  describe('Given an indirectly scoped entity with tenantChain', () => {
    const orgsTable = d.table('organizations', {
      id: d.uuid().primary(),
      name: d.text(),
    });

    const projectsTable = d.table('projects', {
      id: d.uuid().primary(),
      organizationId: d.uuid(),
      name: d.text(),
    });

    const tasksTable = d.table('tasks', {
      id: d.uuid().primary(),
      projectId: d.uuid(),
      title: d.text(),
    });

    const tasksModel = d.model(tasksTable, {
      project: d.ref.one(() => projectsTable, 'projectId'),
    });

    const def = entity('tasks', {
      model: tasksModel,
      access: { list: (ctx) => ctx.authenticated(), get: (ctx) => ctx.authenticated() },
    });

    // Single-hop chain: tasks.projectId → projects.id, tenantColumn: organizationId
    const tenantChain = {
      hops: [{ tableName: 'projects', foreignKey: 'projectId', targetColumn: 'id' }],
      tenantColumn: 'organizationId',
    } as const;

    // Seed data
    const orgA = { id: 'org-a', name: 'Org A' };
    const orgB = { id: 'org-b', name: 'Org B' };
    const projectA = { id: 'proj-a', organizationId: 'org-a', name: 'Project A' };
    const projectB = { id: 'proj-b', organizationId: 'org-b', name: 'Project B' };

    function createTasksDb() {
      const rows: Record<string, unknown>[] = [
        { id: 'task-a1', projectId: 'proj-a', title: 'Task A1' },
        { id: 'task-a2', projectId: 'proj-a', title: 'Task A2' },
        { id: 'task-b1', projectId: 'proj-b', title: 'Task B1' },
      ];

      function matchesWhere(
        row: Record<string, unknown>,
        where?: Record<string, unknown>,
      ): boolean {
        if (!where) return true;
        return Object.entries(where).every(([key, value]) => {
          if (typeof value === 'object' && value !== null && 'in' in value) {
            return (value as { in: unknown[] }).in.includes(row[key]);
          }
          return row[key] === value;
        });
      }

      return {
        get: mock(async (id: string, options?: { where?: Record<string, unknown> }) => {
          const row = rows.find((r) => r.id === id) ?? null;
          if (!row) return null;
          if (options?.where && !matchesWhere(row, options.where)) return null;
          return row;
        }),
        list: mock(
          async (options?: { where?: Record<string, unknown>; limit?: number; after?: string }) => {
            let result = [...rows];
            const where = options?.where;
            if (where) {
              result = result.filter((row) => matchesWhere(row, where));
            }
            return { data: result, total: result.length };
          },
        ),
        create: mock(async (data: Record<string, unknown>) => ({ id: 'new-id', ...data })),
        update: mock(
          async (
            id: string,
            data: Record<string, unknown>,
            options?: { where?: Record<string, unknown> },
          ) => {
            const row = rows.find((r) => r.id === id);
            if (row && options?.where && !matchesWhere(row, options.where)) {
              throw new Error('Update matched 0 rows');
            }
            return { id, ...data };
          },
        ),
        delete: mock(async (id: string, options?: { where?: Record<string, unknown> }) => {
          const row = rows.find((r) => r.id === id);
          if (row && options?.where && !matchesWhere(row, options.where)) {
            throw new Error('Delete matched 0 rows');
          }
          return row ?? null;
        }),
      };
    }

    // queryParentIds resolves IDs from parent tables
    const parentStores: Record<string, Record<string, unknown>[]> = {
      organizations: [orgA, orgB],
      projects: [projectA, projectB],
    };

    const queryParentIds = async (
      tableName: string,
      where: Record<string, unknown>,
    ): Promise<string[]> => {
      const store = parentStores[tableName] ?? [];
      return store
        .filter((row) =>
          Object.entries(where).every(([key, value]) => {
            if (typeof value === 'object' && value !== null && 'in' in value) {
              return (value as { in: unknown[] }).in.includes(row[key]);
            }
            return row[key] === value;
          }),
        )
        .map((row) => row.id as string);
    };

    describe('When org-A user lists tasks', () => {
      it('Then returns only tasks whose project belongs to org-A', async () => {
        const db = createTasksDb();
        const handlers = createCrudHandlers(def, db, {
          tenantChain,
          queryParentIds,
        });
        const ctx = makeCtx({ tenantId: 'org-a' });

        const result = unwrap(await handlers.list(ctx));

        expect(result.body.items).toHaveLength(2);
        expect(result.body.items.map((i) => i.id)).toEqual(['task-a1', 'task-a2']);
      });
    });

    describe('When org-B user lists tasks', () => {
      it('Then returns only tasks in org-B projects', async () => {
        const db = createTasksDb();
        const handlers = createCrudHandlers(def, db, {
          tenantChain,
          queryParentIds,
        });
        const ctx = makeCtx({ tenantId: 'org-b' });

        const result = unwrap(await handlers.list(ctx));

        expect(result.body.items).toHaveLength(1);
        expect(result.body.items[0]).toHaveProperty('id', 'task-b1');
      });
    });

    describe('When user has no tenantId', () => {
      it('Then returns empty list (no tenant = no results for indirect scoping)', async () => {
        const db = createTasksDb();
        const handlers = createCrudHandlers(def, db, {
          tenantChain,
          queryParentIds,
        });
        const ctx = makeCtx({ tenantId: null });

        const result = unwrap(await handlers.list(ctx));

        expect(result.body.items).toHaveLength(0);
      });
    });

    describe('When org-A user GETs a task from org-B project', () => {
      it('Then returns 404 (indirect tenant check)', async () => {
        const db = createTasksDb();
        const handlers = createCrudHandlers(def, db, {
          tenantChain,
          queryParentIds,
        });
        const ctx = makeCtx({ tenantId: 'org-a' });

        const result = await handlers.get(ctx, 'task-b1');

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityNotFoundError);
        }
      });
    });

    describe('When org-A user GETs a task from org-A project', () => {
      it('Then returns the task', async () => {
        const db = createTasksDb();
        const handlers = createCrudHandlers(def, db, {
          tenantChain,
          queryParentIds,
        });
        const ctx = makeCtx({ tenantId: 'org-a' });

        const result = unwrap(await handlers.get(ctx, 'task-a1'));

        expect(result.status).toBe(200);
        expect(result.body).toHaveProperty('id', 'task-a1');
      });
    });

    describe('When org-A user UPDATEs a task from org-B project', () => {
      it('Then returns 404', async () => {
        const def2 = entity('tasks', {
          model: tasksModel,
          access: {
            list: (ctx) => ctx.authenticated(),
            get: (ctx) => ctx.authenticated(),
            update: (ctx) => ctx.authenticated(),
          },
        });
        const db = createTasksDb();
        const handlers = createCrudHandlers(def2, db, {
          tenantChain,
          queryParentIds,
        });
        const ctx = makeCtx({ tenantId: 'org-a' });

        const result = await handlers.update(ctx, 'task-b1', { title: 'Hacked' });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityNotFoundError);
        }
      });
    });

    describe('When org-A user DELETEs a task from org-B project', () => {
      it('Then returns 404', async () => {
        const def2 = entity('tasks', {
          model: tasksModel,
          access: {
            list: (ctx) => ctx.authenticated(),
            get: (ctx) => ctx.authenticated(),
            delete: (ctx) => ctx.authenticated(),
          },
        });
        const db = createTasksDb();
        const handlers = createCrudHandlers(def2, db, {
          tenantChain,
          queryParentIds,
        });
        const ctx = makeCtx({ tenantId: 'org-a' });

        const result = await handlers.delete(ctx, 'task-b1');

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityNotFoundError);
        }
      });
    });

    describe('When org-A user creates a task on org-A project', () => {
      it('Then succeeds', async () => {
        const def2 = entity('tasks', {
          model: tasksModel,
          access: {
            list: (ctx) => ctx.authenticated(),
            create: (ctx) => ctx.authenticated(),
          },
        });
        const db = createTasksDb();
        const handlers = createCrudHandlers(def2, db, {
          tenantChain,
          queryParentIds,
        });
        const ctx = makeCtx({ tenantId: 'org-a' });

        const result = unwrap(await handlers.create(ctx, { projectId: 'proj-a', title: 'New' }));

        expect(result.status).toBe(201);
      });
    });

    describe('When org-A user creates a task on org-B project', () => {
      it('Then returns 403 (parent entity not in tenant)', async () => {
        const def2 = entity('tasks', {
          model: tasksModel,
          access: {
            list: (ctx) => ctx.authenticated(),
            create: (ctx) => ctx.authenticated(),
          },
        });
        const db = createTasksDb();
        const handlers = createCrudHandlers(def2, db, {
          tenantChain,
          queryParentIds,
        });
        const ctx = makeCtx({ tenantId: 'org-a' });

        const result = await handlers.create(ctx, { projectId: 'proj-b', title: 'Hacked' });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });

    describe('When org-A user creates a task with non-existent projectId', () => {
      it('Then returns 404 for the parent', async () => {
        const def2 = entity('tasks', {
          model: tasksModel,
          access: {
            list: (ctx) => ctx.authenticated(),
            create: (ctx) => ctx.authenticated(),
          },
        });
        const db = createTasksDb();
        const handlers = createCrudHandlers(def2, db, {
          tenantChain,
          queryParentIds,
        });
        const ctx = makeCtx({ tenantId: 'org-a' });

        const result = await handlers.create(ctx, { projectId: 'nonexistent', title: 'Ghost' });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityNotFoundError);
        }
      });
    });
  });

  // --- Entitlement-based access via accessConfig ---

  describe('Given an entity with rules.entitlement() access and accessConfig wired', () => {
    const accessDef = defineAccess({
      entities: {
        workspace: { roles: ['owner', 'member'] },
      },
      entitlements: {
        'workspace:read': { roles: ['owner', 'member'] },
        'workspace:manage': { roles: ['owner'] },
      },
    });

    const entitlementDef = entity('users', {
      model: usersModel,
      access: {
        list: rules.entitlement('workspace:read'),
        get: rules.entitlement('workspace:read'),
        create: rules.entitlement('workspace:manage'),
      },
    });

    describe('When user has the required role for the entitlement', () => {
      it('Then list succeeds', async () => {
        const db = createStubDb();
        const roleStore = new InMemoryRoleAssignmentStore();
        const closureStore = new InMemoryClosureStore();
        await roleStore.assign('user-1', 'workspace', 'ws-1', 'member');

        const handlers = createCrudHandlers(entitlementDef, db, {
          accessConfig: {
            definition: accessDef,
            roleStore,
            closureStore,
          },
          tenantResourceType: 'workspace',
        });

        const ctx = makeCtx({ tenantId: 'ws-1' });
        const result = await handlers.list(ctx);
        expect(result.ok).toBe(true);
      });
    });

    describe('When user does NOT have the required role for the entitlement', () => {
      it('Then list returns 403', async () => {
        const db = createStubDb();
        const roleStore = new InMemoryRoleAssignmentStore();
        const closureStore = new InMemoryClosureStore();
        // user-1 has no role assignments

        const handlers = createCrudHandlers(entitlementDef, db, {
          accessConfig: {
            definition: accessDef,
            roleStore,
            closureStore,
          },
          tenantResourceType: 'workspace',
        });

        const ctx = makeCtx({ tenantId: 'ws-1' });
        const result = await handlers.list(ctx);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });

    describe('When user has member role but entitlement requires owner', () => {
      it('Then create returns 403', async () => {
        const db = createStubDb();
        const roleStore = new InMemoryRoleAssignmentStore();
        const closureStore = new InMemoryClosureStore();
        await roleStore.assign('user-1', 'workspace', 'ws-1', 'member');

        const handlers = createCrudHandlers(entitlementDef, db, {
          accessConfig: {
            definition: accessDef,
            roleStore,
            closureStore,
          },
          tenantResourceType: 'workspace',
        });

        const ctx = makeCtx({ tenantId: 'ws-1' });
        const result = await handlers.create(ctx, { email: 'new@test.com', name: 'New' });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });

    describe('When no accessConfig is provided (backward compat)', () => {
      it('Then entitlement rules always deny', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(entitlementDef, db);

        const ctx = makeCtx({ tenantId: 'ws-1' });
        const result = await handlers.list(ctx);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 2: rules.where() pushed to DB for GET/UPDATE/DELETE
  // ---------------------------------------------------------------------------

  describe('Feature: rules.where() pushed to DB for GET/UPDATE/DELETE', () => {
    // Fixtures: entity with createdBy-based where rules
    const whereTable = d.table('tasks', {
      id: d.uuid().primary(),
      title: d.text(),
      createdBy: d.text(),
      status: d.text().default('draft'),
    });
    const whereModel = d.model(whereTable);

    function createWhereStubDb() {
      const rows: Record<string, Record<string, unknown>> = {
        'task-1': { id: 'task-1', title: 'My Task', createdBy: 'user-A', status: 'draft' },
        'task-2': { id: 'task-2', title: 'Other Task', createdBy: 'user-B', status: 'published' },
      };

      function matchesWhere(
        row: Record<string, unknown>,
        where?: Record<string, unknown>,
      ): boolean {
        if (!where) return true;
        return Object.entries(where).every(([key, value]) => {
          if (typeof value === 'object' && value !== null && 'in' in value) {
            return (value as { in: unknown[] }).in.includes(row[key]);
          }
          return row[key] === value;
        });
      }

      return {
        get: mock(async (id: string, options?: { where?: Record<string, unknown> }) => {
          const row = rows[id] ?? null;
          if (!row) return null;
          if (options?.where && !matchesWhere(row, options.where)) return null;
          return row;
        }),
        list: mock(async (options?: { where?: Record<string, unknown> }) => {
          let result = Object.values(rows);
          if (options?.where) {
            result = result.filter((row) => matchesWhere(row, options.where!));
          }
          return { data: result, total: result.length };
        }),
        create: mock(async (data: Record<string, unknown>) => ({ id: 'new-id', ...data })),
        update: mock(
          async (
            id: string,
            data: Record<string, unknown>,
            options?: { where?: Record<string, unknown> },
          ) => {
            const row = rows[id];
            if (row && options?.where && !matchesWhere(row, options.where)) {
              throw new Error('Update matched 0 rows');
            }
            return { ...row, ...data };
          },
        ),
        delete: mock(async (id: string, options?: { where?: Record<string, unknown> }) => {
          const row = rows[id];
          if (row && options?.where && !matchesWhere(row, options.where)) {
            throw new Error('Delete matched 0 rows');
          }
          return row ?? null;
        }),
      };
    }

    // --- GET with rules.where() ---

    describe('Given entity access: { get: rules.where({ createdBy: rules.user.id }) }', () => {
      const def = entity('tasks', {
        model: whereModel,
        access: { get: rules.where({ createdBy: rules.user.id }) },
      });

      describe('When get() is called by the owner (user-A)', () => {
        it('Then db.get receives where: { createdBy: userId }', async () => {
          const db = createWhereStubDb();
          const handlers = createCrudHandlers(def, db);
          const ctx = makeCtx({ userId: 'user-A' });

          await handlers.get(ctx, 'task-1');

          const getCall = db.get.mock.calls[0]!;
          expect(getCall[1]).toEqual(expect.objectContaining({ where: { createdBy: 'user-A' } }));
        });

        it('Then returns the row (owner match)', async () => {
          const db = createWhereStubDb();
          const handlers = createCrudHandlers(def, db);
          const ctx = makeCtx({ userId: 'user-A' });

          const result = await handlers.get(ctx, 'task-1');
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.data.status).toBe(200);
            expect(result.data.body).toHaveProperty('title', 'My Task');
          }
        });
      });

      describe('When get() is called by a non-owner (user-A gets task-2)', () => {
        it('Then returns 404 (not 403) — does not reveal existence', async () => {
          const db = createWhereStubDb();
          const handlers = createCrudHandlers(def, db);
          const ctx = makeCtx({ userId: 'user-A' });

          const result = await handlers.get(ctx, 'task-2');
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error).toBeInstanceOf(EntityNotFoundError);
        });
      });
    });

    // --- GET with rules.all(authenticated, where) ---

    describe('Given entity access: { get: rules.all(rules.authenticated(), rules.where({ status: "published" })) }', () => {
      const def = entity('tasks', {
        model: whereModel,
        access: {
          get: rules.all(rules.authenticated(), rules.where({ status: 'published' })),
        },
      });

      describe('When authenticated user calls get(draft-task)', () => {
        it('Then returns 404 (where condition pushed to DB)', async () => {
          const db = createWhereStubDb();
          const handlers = createCrudHandlers(def, db);
          const ctx = makeCtx({ userId: 'user-A' });

          const result = await handlers.get(ctx, 'task-1'); // task-1 is draft
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error).toBeInstanceOf(EntityNotFoundError);
        });
      });

      describe('When unauthenticated user calls get(published-task)', () => {
        it('Then returns 403 (non-where rule still evaluated in-memory)', async () => {
          const db = createWhereStubDb();
          const handlers = createCrudHandlers(def, db);
          const ctx = makeCtx({ userId: null });

          const result = await handlers.get(ctx, 'task-2'); // task-2 is published
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error).toBeInstanceOf(EntityForbiddenError);
        });
      });
    });

    // --- GET with no where rules (should be unchanged) ---

    describe('Given entity with no where rules on get (e.g., rules.authenticated())', () => {
      const def = entity('tasks', {
        model: whereModel,
        access: { get: rules.authenticated() },
      });

      describe('When get() is called', () => {
        it('Then enforceAccess is called WITHOUT skipWhere', async () => {
          const db = createWhereStubDb();
          const handlers = createCrudHandlers(def, db);
          const ctx = makeCtx({ userId: 'user-A' });

          const result = await handlers.get(ctx, 'task-1');
          expect(result.ok).toBe(true);
          // db.get should NOT have where conditions (only id)
          const getCall = db.get.mock.calls[0]!;
          expect(getCall[1]).toBeUndefined();
        });
      });
    });

    // --- UPDATE with rules.where() ---

    describe('Given entity access: { update: rules.where({ createdBy: rules.user.id }) }', () => {
      const def = entity('tasks', {
        model: whereModel,
        access: { update: rules.where({ createdBy: rules.user.id }) },
      });

      describe('When update() is called by the owner', () => {
        it('Then db.get receives where: { createdBy: userId }', async () => {
          const db = createWhereStubDb();
          const handlers = createCrudHandlers(def, db);
          const ctx = makeCtx({ userId: 'user-A' });

          await handlers.update(ctx, 'task-1', { title: 'Updated' });

          const getCall = db.get.mock.calls[0]!;
          expect(getCall[1]).toEqual(expect.objectContaining({ where: { createdBy: 'user-A' } }));
        });

        it('Then db.update receives where: { createdBy: userId } (defense-in-depth)', async () => {
          const db = createWhereStubDb();
          const handlers = createCrudHandlers(def, db);
          const ctx = makeCtx({ userId: 'user-A' });

          await handlers.update(ctx, 'task-1', { title: 'Updated' });

          const updateCall = db.update.mock.calls[0]!;
          expect(updateCall[2]).toEqual({ where: { createdBy: 'user-A' } });
        });

        it('Then update succeeds', async () => {
          const db = createWhereStubDb();
          const handlers = createCrudHandlers(def, db);
          const ctx = makeCtx({ userId: 'user-A' });

          const result = await handlers.update(ctx, 'task-1', { title: 'Updated' });
          expect(result.ok).toBe(true);
        });
      });

      describe('When update() is called by a non-owner', () => {
        it('Then returns 404 (not 403)', async () => {
          const db = createWhereStubDb();
          const handlers = createCrudHandlers(def, db);
          const ctx = makeCtx({ userId: 'user-A' });

          const result = await handlers.update(ctx, 'task-2', { title: 'Hacked' });
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error).toBeInstanceOf(EntityNotFoundError);
        });

        it('Then db.update is NOT called', async () => {
          const db = createWhereStubDb();
          const handlers = createCrudHandlers(def, db);
          const ctx = makeCtx({ userId: 'user-A' });

          await handlers.update(ctx, 'task-2', { title: 'Hacked' });
          expect(db.update).not.toHaveBeenCalled();
        });
      });
    });

    // --- DELETE with rules.where() ---

    describe('Given entity access: { delete: rules.where({ createdBy: rules.user.id }) }', () => {
      const def = entity('tasks', {
        model: whereModel,
        access: { delete: rules.where({ createdBy: rules.user.id }) },
      });

      describe('When delete() is called by the owner', () => {
        it('Then deletes successfully', async () => {
          const db = createWhereStubDb();
          const handlers = createCrudHandlers(def, db);
          const ctx = makeCtx({ userId: 'user-A' });

          const result = await handlers.delete(ctx, 'task-1');
          expect(result.ok).toBe(true);
          if (result.ok) expect(result.data.status).toBe(204);
        });

        it('Then db.delete receives where: { createdBy: userId } (defense-in-depth)', async () => {
          const db = createWhereStubDb();
          const handlers = createCrudHandlers(def, db);
          const ctx = makeCtx({ userId: 'user-A' });

          await handlers.delete(ctx, 'task-1');

          const deleteCall = db.delete.mock.calls[0]!;
          expect(deleteCall[1]).toEqual({ where: { createdBy: 'user-A' } });
        });
      });

      describe('When delete() is called by a non-owner', () => {
        it('Then returns 404 (not 403)', async () => {
          const db = createWhereStubDb();
          const handlers = createCrudHandlers(def, db);
          const ctx = makeCtx({ userId: 'user-A' });

          const result = await handlers.delete(ctx, 'task-2');
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error).toBeInstanceOf(EntityNotFoundError);
        });

        it('Then db.delete is NOT called', async () => {
          const db = createWhereStubDb();
          const handlers = createCrudHandlers(def, db);
          const ctx = makeCtx({ userId: 'user-A' });

          await handlers.delete(ctx, 'task-2');
          expect(db.delete).not.toHaveBeenCalled();
        });
      });
    });

    // --- TOCTOU defense-in-depth ---

    describe('Given TOCTOU race: row ownership changes between get and update', () => {
      const def = entity('tasks', {
        model: whereModel,
        access: {
          update: rules.where({ createdBy: rules.user.id }),
          delete: rules.where({ createdBy: rules.user.id }),
        },
      });

      describe('When db.get succeeds but db.update throws (simulated race)', () => {
        it('Then returns 404 (not 500)', async () => {
          const db = createWhereStubDb();
          // Override update to always throw (simulates TOCTOU race)
          db.update.mockImplementation(async () => {
            throw new Error('Update matched 0 rows');
          });
          // Override get to return the row (it existed at check time)
          db.get.mockImplementation(async () => ({
            id: 'task-1',
            title: 'My Task',
            createdBy: 'user-A',
            status: 'draft',
          }));
          const handlers = createCrudHandlers(def, db);
          const ctx = makeCtx({ userId: 'user-A' });

          const result = await handlers.update(ctx, 'task-1', { title: 'Updated' });
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error).toBeInstanceOf(EntityNotFoundError);
        });
      });

      describe('When db.get succeeds but db.delete throws (simulated race)', () => {
        it('Then returns 404 (not 500)', async () => {
          const db = createWhereStubDb();
          // Override delete to always throw
          db.delete.mockImplementation(async () => {
            throw new Error('Delete matched 0 rows');
          });
          db.get.mockImplementation(async () => ({
            id: 'task-1',
            title: 'My Task',
            createdBy: 'user-A',
            status: 'draft',
          }));
          const handlers = createCrudHandlers(def, db);
          const ctx = makeCtx({ userId: 'user-A' });

          const result = await handlers.delete(ctx, 'task-1');
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error).toBeInstanceOf(EntityNotFoundError);
        });
      });
    });

    // --- BLOCKER-1 regression: all(where, any(where, entitlement)) ---

    describe('Given entity access: { get: rules.all(where({status}), any(where({createdBy}), entitlement)) }', () => {
      const def = entity('tasks', {
        model: whereModel,
        access: {
          get: rules.all(
            rules.where({ status: 'draft' }),
            rules.any(
              rules.where({ createdBy: rules.user.id }),
              rules.entitlement('tasks:read-any'),
            ),
          ),
        },
      });

      describe('When get() is called and row matches all-level where but NOT any-level where', () => {
        it('Then denies access (where inside any evaluated in-memory, not blindly skipped)', async () => {
          const db = createWhereStubDb();
          const handlers = createCrudHandlers(def, db);
          // user-A trying to read task-1 (createdBy: 'user-A', status: 'draft')
          // This should PASS because both conditions match
          const ctx = makeCtx({ userId: 'user-A' });
          const result = await handlers.get(ctx, 'task-1');
          expect(result.ok).toBe(true);
        });

        it('Then returns 404 for non-owner without entitlement', async () => {
          const db = createWhereStubDb();
          const handlers = createCrudHandlers(def, db);
          // user-A trying to read task-2 (createdBy: 'user-B', status: 'published')
          // status 'published' != 'draft' → db.get returns null (where pushed to DB)
          const ctx = makeCtx({ userId: 'user-A' });
          const result = await handlers.get(ctx, 'task-2');
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error).toBeInstanceOf(EntityNotFoundError);
        });
      });
    });

    // --- BLOCKER-2 regression: delete returns null instead of throwing ---

    describe('Given TOCTOU race where db.delete returns null (bridge adapter behavior)', () => {
      const def = entity('tasks', {
        model: whereModel,
        access: { delete: rules.where({ createdBy: rules.user.id }) },
      });

      it('Then returns 404 when db.delete returns null', async () => {
        const db = createWhereStubDb();
        // Override delete to return null (mimics bridge adapter behavior on failure)
        db.delete.mockImplementation(async () => null);
        // Override get to return the row (it existed at check time)
        db.get.mockImplementation(async () => ({
          id: 'task-1',
          title: 'My Task',
          createdBy: 'user-A',
          status: 'draft',
        }));
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ userId: 'user-A' });

        const result = await handlers.delete(ctx, 'task-1');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBeInstanceOf(EntityNotFoundError);
      });
    });

    // --- SHOULD-FIX-2: tenant-scoped entity WITH access where rules ---

    describe('Given tenant-scoped entity with rules.where on get', () => {
      const tenantWhereTable = d.table('tasks', {
        id: d.uuid().primary(),
        title: d.text(),
        createdBy: d.text(),
        tenantId: d.uuid(),
        status: d.text().default('draft'),
      });
      const tenantWhereModel = d.model(tenantWhereTable);
      const def = entity('tasks', {
        model: tenantWhereModel,
        access: {
          get: rules.where({ createdBy: rules.user.id }),
        },
      });

      function createTenantWhereStubDb() {
        const rows: Record<string, Record<string, unknown>> = {
          'task-1': {
            id: 'task-1',
            title: 'My Task',
            createdBy: 'user-A',
            tenantId: 'tenant-a',
            status: 'draft',
          },
          'task-2': {
            id: 'task-2',
            title: 'Other Task',
            createdBy: 'user-B',
            tenantId: 'tenant-a',
            status: 'draft',
          },
          'task-3': {
            id: 'task-3',
            title: 'Cross Tenant',
            createdBy: 'user-A',
            tenantId: 'tenant-b',
            status: 'draft',
          },
        };

        function matchesWhere(
          row: Record<string, unknown>,
          where?: Record<string, unknown>,
        ): boolean {
          if (!where) return true;
          return Object.entries(where).every(([key, value]) => {
            if (typeof value === 'object' && value !== null && 'in' in value) {
              return (value as { in: unknown[] }).in.includes(row[key]);
            }
            return row[key] === value;
          });
        }

        return {
          get: mock(async (id: string, options?: { where?: Record<string, unknown> }) => {
            const row = rows[id] ?? null;
            if (!row) return null;
            if (options?.where && !matchesWhere(row, options.where)) return null;
            return row;
          }),
          list: mock(async (options?: { where?: Record<string, unknown> }) => {
            let result = Object.values(rows);
            if (options?.where) {
              result = result.filter((row) => matchesWhere(row, options.where!));
            }
            return { data: result, total: result.length };
          }),
          create: mock(async (data: Record<string, unknown>) => ({ id: 'new-id', ...data })),
          update: mock(
            async (
              id: string,
              data: Record<string, unknown>,
              options?: { where?: Record<string, unknown> },
            ) => {
              const row = rows[id];
              if (row && options?.where && !matchesWhere(row, options.where)) {
                throw new Error('Update matched 0 rows');
              }
              return { ...row, ...data };
            },
          ),
          delete: mock(async (id: string, options?: { where?: Record<string, unknown> }) => {
            const row = rows[id];
            if (row && options?.where && !matchesWhere(row, options.where)) {
              throw new Error('Delete matched 0 rows');
            }
            return row ?? null;
          }),
        };
      }

      it('Then db.get receives where with BOTH tenantId AND access where conditions', async () => {
        const db = createTenantWhereStubDb();
        const handlers = createCrudHandlers(def, db);
        const ctx = makeCtx({ userId: 'user-A', tenantId: 'tenant-a' });

        await handlers.get(ctx, 'task-1');

        const getCall = db.get.mock.calls[0]!;
        expect(getCall[1]).toEqual(
          expect.objectContaining({
            where: expect.objectContaining({
              createdBy: 'user-A',
              tenantId: 'tenant-a',
            }),
          }),
        );
      });

      it('Then returns 404 for own task in different tenant', async () => {
        const db = createTenantWhereStubDb();
        const handlers = createCrudHandlers(def, db);
        // user-A in tenant-a trying to access task-3 (user-A's task but in tenant-b)
        const ctx = makeCtx({ userId: 'user-A', tenantId: 'tenant-a' });

        const result = await handlers.get(ctx, 'task-3');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBeInstanceOf(EntityNotFoundError);
      });

      it('Then returns 404 for other user task in same tenant', async () => {
        const db = createTenantWhereStubDb();
        const handlers = createCrudHandlers(def, db);
        // user-A trying to access task-2 (user-B's task in tenant-a)
        const ctx = makeCtx({ userId: 'user-A', tenantId: 'tenant-a' });

        const result = await handlers.get(ctx, 'task-2');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBeInstanceOf(EntityNotFoundError);
      });
    });
  });
});
