import { describe, expect, it, mock } from '@vertz/test';
import { d } from '@vertz/db';
import { EntityValidationError, isEntityValidationError, unwrap } from '@vertz/errors';
import { createEntityContext } from '../context';
import { createCrudHandlers } from '../crud-pipeline';
import { entity } from '../entity';
import { EntityRegistry } from '../entity-registry';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tasksTable = d.table('tasks', {
  id: d.uuid().primary(),
  title: d.text(),
  description: d.text().nullable(),
  priority: d.enum('task_priority', ['low', 'medium', 'high']).default('medium'),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
  passwordHash: d.text().is('hidden'),
});

const tasksModel = d.model(tasksTable);

const taskEntity = entity('task', {
  model: tasksModel,
  access: {
    create: (ctx) => ctx.authenticated(),
    update: (ctx) => ctx.authenticated(),
  },
});

// ---------------------------------------------------------------------------
// Stub DB
// ---------------------------------------------------------------------------

function createStubDb() {
  const rows: Record<string, Record<string, unknown>> = {
    'task-1': {
      id: 'task-1',
      title: 'Existing task',
      description: 'A task',
      priority: 'high',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
      passwordHash: 'hash',
    },
  };

  return {
    get: mock(async (id: string) => rows[id] ?? null),
    list: mock(async () => ({ data: Object.values(rows), total: 1 })),
    create: mock(async (data: Record<string, unknown>) => ({
      id: 'new-id',
      ...data,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
      passwordHash: 'generated',
    })),
    update: mock(async (id: string, data: Record<string, unknown>) => ({
      ...rows[id],
      ...data,
      updatedAt: '2024-01-02',
    })),
    delete: mock(async (id: string) => rows[id] ?? null),
  };
}

function makeCtx(overrides: { userId?: string | null; tenantId?: string | null } = {}) {
  const registry = new EntityRegistry();
  return createEntityContext(
    {
      userId: 'userId' in overrides ? overrides.userId : 'user-1',
      tenantId: overrides.tenantId ?? null,
      roles: [],
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

describe('Feature: CRUD schema validation', () => {
  // -------------------------------------------------------------------------
  // CREATE validation
  // -------------------------------------------------------------------------

  describe('Given an entity with typed columns', () => {
    describe('When POST with unknown key', () => {
      it('Then returns validation error with unrecognized_keys', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(taskEntity, db);
        const ctx = makeCtx();

        const result = await handlers.create(ctx, {
          title: 'Buy milk',
          task_title: 'Buy milk',
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityValidationError);
          if (isEntityValidationError(result.error)) {
            const codes = result.error.errors.map((e) => e.code);
            expect(codes).toContain('unrecognized_keys');
          }
        }
      });
    });

    describe('When POST with wrong type', () => {
      it('Then returns validation error with invalid_type at path', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(taskEntity, db);
        const ctx = makeCtx();

        const result = await handlers.create(ctx, {
          title: 123,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityValidationError);
          if (isEntityValidationError(result.error)) {
            const titleError = result.error.errors.find((e) => e.path[0] === 'title');
            expect(titleError).toBeDefined();
            expect(titleError!.code).toBe('invalid_type');
          }
        }
      });
    });

    describe('When POST with missing required field', () => {
      it('Then returns validation error with missing_property', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(taskEntity, db);
        const ctx = makeCtx();

        const result = await handlers.create(ctx, {
          // title is required but missing
          description: 'some description',
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityValidationError);
          if (isEntityValidationError(result.error)) {
            const codes = result.error.errors.map((e) => e.code);
            expect(codes).toContain('missing_property');
          }
        }
      });
    });

    describe('When POST with valid camelCase payload', () => {
      it('Then returns 201 with the created entity', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(taskEntity, db);
        const ctx = makeCtx();

        const result = await handlers.create(ctx, {
          title: 'Buy milk',
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.status).toBe(201);
        }
      });
    });

    describe('When POST with optional defaults provided', () => {
      it('Then accepts the optional fields', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(taskEntity, db);
        const ctx = makeCtx();

        const result = await handlers.create(ctx, {
          title: 'Buy milk',
          priority: 'high',
          description: 'From the store',
        });

        expect(result.ok).toBe(true);
      });
    });

    describe('When POST with readOnly field "createdAt"', () => {
      it('Then returns validation error — readOnly fields rejected', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(taskEntity, db);
        const ctx = makeCtx();

        const result = await handlers.create(ctx, {
          title: 'Buy milk',
          createdAt: '2024-01-01',
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityValidationError);
        }
      });
    });

    describe('When POST with hidden field "passwordHash"', () => {
      it('Then returns validation error — hidden fields rejected', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(taskEntity, db);
        const ctx = makeCtx();

        const result = await handlers.create(ctx, {
          title: 'Buy milk',
          passwordHash: 'sneaky',
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityValidationError);
        }
      });
    });
  });

  // -------------------------------------------------------------------------
  // UPDATE validation
  // -------------------------------------------------------------------------

  describe('Given an entity for PATCH updates', () => {
    describe('When PATCH with unknown key', () => {
      it('Then returns validation error with unrecognized_keys', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(taskEntity, db);
        const ctx = makeCtx();

        const result = await handlers.update(ctx, 'task-1', {
          title: 'Updated',
          unknown_field: true,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityValidationError);
          if (isEntityValidationError(result.error)) {
            const codes = result.error.errors.map((e) => e.code);
            expect(codes).toContain('unrecognized_keys');
          }
        }
      });
    });

    describe('When PATCH with valid partial payload', () => {
      it('Then returns 200', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(taskEntity, db);
        const ctx = makeCtx();

        const result = await handlers.update(ctx, 'task-1', {
          title: 'Updated title',
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.status).toBe(200);
        }
      });
    });

    describe('When PATCH with empty body', () => {
      it('Then returns 200 with unchanged entity', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(taskEntity, db);
        const ctx = makeCtx();

        const result = await handlers.update(ctx, 'task-1', {});

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.status).toBe(200);
        }
      });
    });

    describe('When PATCH with readOnly field', () => {
      it('Then returns validation error', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(taskEntity, db);
        const ctx = makeCtx();

        const result = await handlers.update(ctx, 'task-1', {
          createdAt: '2024-06-01',
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityValidationError);
        }
      });
    });
  });

  // -------------------------------------------------------------------------
  // Tenant column exclusion
  // -------------------------------------------------------------------------

  describe('Given a tenant-scoped entity', () => {
    const projectsTable = d
      .table('projects', {
        id: d.uuid().primary(),
        tenantId: d.uuid(),
        name: d.text(),
      })
      .tenant();

    const projectsModel = d.model(projectsTable);

    const projectEntity = entity('project', {
      model: projectsModel,
      access: {
        create: (ctx) => ctx.authenticated(),
      },
    });

    describe('When POST includes tenantId in body', () => {
      it('Then returns validation error — tenantId is auto-set by pipeline', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(projectEntity, db);
        const ctx = makeCtx();

        const result = await handlers.create(ctx, {
          name: 'My Project',
          tenantId: '00000000-0000-4000-a000-000000000001',
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityValidationError);
          if (isEntityValidationError(result.error)) {
            const codes = result.error.errors.map((e) => e.code);
            expect(codes).toContain('unrecognized_keys');
          }
        }
      });
    });

    describe('When POST without tenantId (correct usage)', () => {
      it('Then succeeds — pipeline auto-sets tenantId from context', async () => {
        const db = createStubDb();
        const handlers = createCrudHandlers(projectEntity, db);
        const ctx = makeCtx();

        const result = await handlers.create(ctx, {
          name: 'My Project',
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.status).toBe(201);
        }
      });
    });
  });
});
