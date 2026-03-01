import { describe, expect, it, mock } from 'bun:test';
import { d } from '@vertz/db';
import { BadRequestError, EntityForbiddenError, EntityNotFoundError } from '@vertz/errors';
import { createActionHandler } from '../action-pipeline';
import { createEntityContext } from '../context';
import { entity } from '../entity';
import { EntityRegistry } from '../entity-registry';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tasksTable = d.table('tasks', {
  id: d.uuid().primary(),
  title: d.text(),
  status: d.text().default('pending'),
  assigneeId: d.uuid(),
  createdAt: d.timestamp().default('now').readOnly(),
});

const tasksModel = d.model(tasksTable);

// ---------------------------------------------------------------------------
// Stub DB
// ---------------------------------------------------------------------------

function createStubDb() {
  const rows: Record<string, Record<string, unknown>> = {
    'task-1': { id: 'task-1', title: 'Fix bug', status: 'pending', assigneeId: 'user-1' },
  };

  return {
    get: mock(async (id: string) => rows[id] ?? null),
    list: mock(async () => Object.values(rows)),
    create: mock(async (data: Record<string, unknown>) => ({ id: 'new-id', ...data })),
    update: mock(async (id: string, data: Record<string, unknown>) => ({ ...rows[id], ...data })),
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

describe('Feature: action pipeline', () => {
  describe('Given an entity with action "complete" and access rule', () => {
    const completeSpy = mock(async () => ({ completedAt: '2024-01-01' }));
    const def = entity('tasks', {
      model: tasksModel,
      access: {
        complete: (ctx) => ctx.authenticated(),
      },
      actions: {
        complete: {
          body: { parse: (v: unknown) => ({ ok: true as const, data: v as { reason: string } }) },
          response: {
            parse: (v: unknown) => ({ ok: true as const, data: v as { completedAt: string } }),
          },
          handler: completeSpy,
        },
      },
    });

    describe('When calling the action with valid input', () => {
      it('Then calls handler with (input, ctx, row) and returns ok Result with 200', async () => {
        const db = createStubDb();
        const handler = createActionHandler(def, 'complete', def.actions.complete, db, true);
        const ctx = makeCtx();

        const result = await handler(ctx, 'task-1', { reason: 'done' });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.status).toBe(200);
          expect(result.data.body).toEqual({ completedAt: '2024-01-01' });
        }
        expect(completeSpy).toHaveBeenCalledOnce();
        // Check handler received correct args
        const [input, , row] = completeSpy.mock.calls[0]!;
        expect(input).toEqual({ reason: 'done' });
        expect(row).toHaveProperty('id', 'task-1');
      });
    });

    describe('When the row does not exist', () => {
      it('Then returns err(EntityNotFoundError)', async () => {
        const db = createStubDb();
        const handler = createActionHandler(def, 'complete', def.actions.complete, db, true);
        const ctx = makeCtx();

        const result = await handler(ctx, 'nonexistent', { reason: 'done' });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityNotFoundError);
          expect(result.error.message).toContain('nonexistent');
        }
      });
    });

    describe('When access is denied', () => {
      it('Then returns err(EntityForbiddenError)', async () => {
        const db = createStubDb();
        const handler = createActionHandler(def, 'complete', def.actions.complete, db, true);
        const ctx = makeCtx({ userId: null });

        const result = await handler(ctx, 'task-1', { reason: 'done' });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });
  });

  describe('Given an entity with action whose input schema rejects', () => {
    const def = entity('tasks', {
      model: tasksModel,
      access: {
        complete: () => true,
      },
      actions: {
        complete: {
          body: {
            parse: () => ({
              ok: false as const,
              error: new Error('reason is required'),
            }),
          },
          response: {
            parse: (v: unknown) => ({ ok: true as const, data: v as { completedAt: string } }),
          },
          handler: mock(async () => ({ completedAt: '2024-01-01' })),
        },
      },
    });

    describe('When input validation fails', () => {
      it('Then returns err(BadRequestError) with the parse error message', async () => {
        const db = createStubDb();
        const handler = createActionHandler(def, 'complete', def.actions.complete, db, true);
        const ctx = makeCtx();

        const result = await handler(ctx, 'task-1', {});

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(BadRequestError);
          expect(result.error.message).toBe('reason is required');
        }
      });
    });
  });

  describe('Given a custom action with after hook', () => {
    const afterCompleteSpy = mock();
    const def = entity('tasks', {
      model: tasksModel,
      access: {
        complete: () => true,
      },
      actions: {
        complete: {
          body: { parse: (v: unknown) => ({ ok: true as const, data: v as { reason: string } }) },
          response: {
            parse: (v: unknown) => ({ ok: true as const, data: v as { done: boolean } }),
          },
          handler: async () => ({ done: true }),
        },
      },
      after: {
        // biome-ignore lint/suspicious/noExplicitAny: testing dynamic after hooks
        complete: afterCompleteSpy,
      } as any,
    });

    describe('When the action completes', () => {
      it('Then after[actionName] fires', async () => {
        const db = createStubDb();
        const handler = createActionHandler(def, 'complete', def.actions.complete, db, true);
        const ctx = makeCtx();

        await handler(ctx, 'task-1', { reason: 'done' });

        expect(afterCompleteSpy).toHaveBeenCalledOnce();
      });
    });
  });

  describe('Given a collection-level action (hasId: false)', () => {
    const statsSpy = mock(async () => ({ total: 5, completed: 3 }));
    const def = entity('tasks', {
      model: tasksModel,
      access: {
        stats: () => true,
      },
      actions: {
        stats: {
          method: 'GET',
          path: 'stats',
          body: { parse: (v: unknown) => ({ ok: true as const, data: v }) },
          response: {
            parse: (v: unknown) => ({
              ok: true as const,
              data: v as { total: number; completed: number },
            }),
          },
          handler: statsSpy,
        },
      },
    });

    describe('When calling the action with hasId: false', () => {
      it('Then does NOT fetch a row and passes null to handler', async () => {
        const db = createStubDb();
        const handler = createActionHandler(def, 'stats', def.actions.stats, db, false);
        const ctx = makeCtx();

        const result = await handler(ctx, null, { status: 'completed' });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.status).toBe(200);
          expect(result.data.body).toEqual({ total: 5, completed: 3 });
        }
        expect(statsSpy).toHaveBeenCalledOnce();
        // Handler should receive null as the row
        const [, , row] = statsSpy.mock.calls[0]!;
        expect(row).toBeNull();
        // DB.get should NOT have been called
        expect(db.get).not.toHaveBeenCalled();
      });
    });
  });
});
