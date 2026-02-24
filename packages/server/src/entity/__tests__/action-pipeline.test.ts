import { ForbiddenException, NotFoundException } from '@vertz/core';
import { d } from '@vertz/db';
import { describe, expect, it, mock } from 'bun:test';
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
          input: { parse: (v: unknown) => v as { reason: string } },
          output: { parse: (v: unknown) => v as { completedAt: string } },
          handler: completeSpy,
        },
      },
    });

    describe('When calling the action with valid input', () => {
      it('Then calls handler with (input, ctx, row) and returns 200', async () => {
        const db = createStubDb();
        const handler = createActionHandler(def, 'complete', def.actions.complete, db);
        const ctx = makeCtx();

        const result = await handler(ctx, 'task-1', { reason: 'done' });

        expect(result.status).toBe(200);
        expect(result.body).toEqual({ completedAt: '2024-01-01' });
        expect(completeSpy).toHaveBeenCalledOnce();
        // Check handler received correct args
        const [input, , row] = completeSpy.mock.calls[0]!;
        expect(input).toEqual({ reason: 'done' });
        expect(row).toHaveProperty('id', 'task-1');
      });
    });

    describe('When the row does not exist', () => {
      it('Then throws NotFoundException', async () => {
        const db = createStubDb();
        const handler = createActionHandler(def, 'complete', def.actions.complete, db);
        const ctx = makeCtx();

        await expect(handler(ctx, 'nonexistent', { reason: 'done' })).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('When access is denied', () => {
      it('Then throws ForbiddenException', async () => {
        const db = createStubDb();
        const handler = createActionHandler(def, 'complete', def.actions.complete, db);
        const ctx = makeCtx({ userId: null });

        await expect(handler(ctx, 'task-1', { reason: 'done' })).rejects.toThrow(
          ForbiddenException,
        );
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
          input: { parse: (v: unknown) => v as { reason: string } },
          output: { parse: (v: unknown) => v as { done: boolean } },
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
        const handler = createActionHandler(def, 'complete', def.actions.complete, db);
        const ctx = makeCtx();

        await handler(ctx, 'task-1', { reason: 'done' });

        expect(afterCompleteSpy).toHaveBeenCalledOnce();
      });
    });
  });
});
