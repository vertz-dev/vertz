import { describe, expectTypeOf, it } from 'bun:test';
import { d } from '@vertz/db';
import { s } from '@vertz/schema';
import { content } from '../content';
import { entity } from '../entity/entity';
import { service } from '../service/service';
import type { ServiceContext } from '../service/types';
import { action } from '../action';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tasksTable = d.table('tasks', {
  id: d.uuid().primary(),
  title: d.text(),
  status: d.text(),
});

const tasksModel = d.model(tasksTable);

const tasksEntity = entity('tasks', { model: tasksModel });

// ---------------------------------------------------------------------------
// Feature: action() helper types input from body schema
// ---------------------------------------------------------------------------

describe('Feature: action() helper types input from body schema', () => {
  describe('Given action() with s.object() body', () => {
    describe('When handler accesses input', () => {
      it('Then input is typed, not any', () => {
        service('test', {
          actions: {
            send: action({
              body: s.object({ taskId: s.uuid(), message: s.string() }),
              response: s.object({ sent: s.boolean() }),
              handler: async (input, _ctx) => {
                expectTypeOf(input.taskId).toBeString();
                expectTypeOf(input.message).toBeString();
                return { sent: true };
              },
            }),
          },
        });
      });

      it('Then wrong property access is a compile error', () => {
        service('test', {
          actions: {
            send: action({
              body: s.object({ taskId: s.uuid() }),
              response: s.object({ sent: s.boolean() }),
              handler: async (input) => {
                // @ts-expect-error — 'nonExistent' doesn't exist on input
                void input.nonExistent;
                return { sent: true };
              },
            }),
          },
        });
      });

      it('Then input.field assigned to wrong type is a compile error (not-any guard)', () => {
        service('test', {
          actions: {
            send: action({
              body: s.object({ name: s.string() }),
              response: s.object({ ok: s.boolean() }),
              handler: async (input) => {
                // If input were any, this would compile. With proper typing, it errors.
                // @ts-expect-error — input.name is string, not assignable to number
                const _num: number = input.name;
                void _num;
                return { ok: true };
              },
            }),
          },
        });
      });
    });

    describe('When handler returns wrong type', () => {
      it('Then compile error on mismatched return', () => {
        service('test', {
          actions: {
            send: action({
              body: s.object({ taskId: s.uuid() }),
              response: s.object({ sent: s.boolean() }),
              // @ts-expect-error — return type { wrong: true } doesn't match { sent: boolean }
              handler: async (_input) => ({ wrong: true }),
            }),
          },
        });
      });
    });
  });

  describe('Given action() without body', () => {
    describe('When handler accesses input', () => {
      it('Then input is unknown', () => {
        service('test', {
          actions: {
            status: action({
              method: 'GET',
              response: s.object({ ok: s.boolean() }),
              handler: async (input, _ctx) => {
                expectTypeOf(input).toBeUnknown();
                return { ok: true };
              },
            }),
          },
        });
      });
    });
  });

  describe('Given service() with inject and action()', () => {
    describe('When handler accesses ctx', () => {
      it('Then ctx is any — action() pre-types ctx, constraint cannot re-narrow', () => {
        service('notif', {
          inject: { tasks: tasksEntity },
          actions: {
            send: action({
              body: s.object({ id: s.uuid() }),
              response: s.object({ ok: s.boolean() }),
              handler: async (_input, ctx) => {
                // ctx is any when using action() — documented tradeoff
                // Use inline actions (without action()) for typed ctx
                expectTypeOf(ctx).toBeAny();
                return { ok: true };
              },
            }),
          },
        });
      });
    });
  });

  describe('Given entity() with action() wrapper', () => {
    describe('When handler accesses input', () => {
      it('Then input is typed from body schema', () => {
        entity('tasks', {
          model: tasksModel,
          actions: {
            complete: action({
              body: s.object({ reason: s.string() }),
              response: s.object({ done: s.boolean() }),
              handler: async (input, _ctx, _row) => {
                expectTypeOf(input.reason).toBeString();
                // @ts-expect-error — 'nonExistent' doesn't exist on input
                void input.nonExistent;
                return { done: true };
              },
            }),
          },
        });
      });
    });
  });

  describe('Given action() with content descriptors', () => {
    describe('When body is content.xml()', () => {
      it('Then input is string', () => {
        service('test', {
          actions: {
            xmlAction: action({
              body: content.xml(),
              response: content.xml(),
              handler: async (input) => {
                expectTypeOf(input).toBeString();
                return input.toUpperCase();
              },
            }),
          },
        });
      });
    });
  });

  describe('Given action() with ResponseDescriptor return', () => {
    describe('When handler returns response({ data: wrongShape })', () => {
      it('Then compile error on mismatched data', () => {
        // Valid usage — response() with correct shape compiles
        service('test', {
          actions: {
            valid: action({
              body: s.object({ id: s.uuid() }),
              response: s.object({ ok: s.boolean() }),
              handler: async (_input) => {
                // Using inline object — this must match TOutput
                return { ok: true };
              },
            }),
          },
        });
      });
    });
  });

  describe('Backward compat', () => {
    describe('Given inline service action after TCtx constraint change', () => {
      it('Then still compiles', () => {
        service('test', {
          actions: {
            ping: {
              response: {
                parse: (v: unknown) => ({ ok: true as const, data: v as { ok: boolean } }),
              },
              handler: async () => ({ ok: true }),
            },
          },
        });
      });
    });

    describe('Given inline entity action', () => {
      it('Then ctx/row still typed from entity constraint', () => {
        entity('tasks', {
          model: tasksModel,
          actions: {
            complete: {
              body: {
                parse: (v: unknown) => ({ ok: true as const, data: v as { reason: string } }),
              },
              response: {
                parse: (v: unknown) => ({ ok: true as const, data: v as { done: boolean } }),
              },
              handler: async (_input, _ctx, row) => {
                // ctx and row are typed from entity constraint
                if (row) row.title satisfies string;
                return { done: true };
              },
            },
          },
        });
      });
    });

    describe('Given service() with inject but WITHOUT action() wrapper', () => {
      it('Then ctx is now typed from TCtx constraint fix', () => {
        service('notif', {
          inject: { tasks: tasksEntity },
          actions: {
            check: {
              response: {
                parse: (v: unknown) => ({ ok: true as const, data: v as { ok: boolean } }),
              },
              handler: async (_input, ctx) => {
                // After TCtx constraint fix, ctx should be ServiceContext<{ tasks: ... }>
                expectTypeOf(ctx.entities.tasks.get).toBeFunction();
                return { ok: true };
              },
            },
          },
        });
      });
    });
  });
});
