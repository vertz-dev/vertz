import { describe, it } from 'bun:test';
import { d, type EntityDbAdapter, type ModelEntry } from '@vertz/db';
import type { EntityError, Result } from '@vertz/errors';
import { createActionHandler } from '../action-pipeline';
import type { CrudResult } from '../crud-pipeline';
import { entity } from '../entity';
import type { EntityActionDef, EntityContext, EntityDefinition } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tasksTable = d.table('tasks', {
  id: d.uuid().primary(),
  title: d.text(),
  status: d.text(),
});

const tasksModel = d.model(tasksTable);

const projectsTable = d.table('projects', {
  id: d.uuid().primary(),
  name: d.text(),
});

const projectsModel = d.model(projectsTable);

const tasksDef = entity('tasks', {
  model: tasksModel,
  access: { complete: () => true },
  actions: {
    complete: {
      body: { parse: (v: unknown) => ({ ok: true as const, data: v as { reason: string } }) },
      response: { parse: (v: unknown) => ({ ok: true as const, data: v as { done: boolean } }) },
      handler: async (_input, _ctx, row) => {
        // row should be typed — title is a string, not unknown
        if (row) row.title satisfies string;
        return { done: true };
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Type tests: createActionHandler generic threading
// ---------------------------------------------------------------------------

describe('Feature: action pipeline model generics', () => {
  describe('Given createActionHandler called with EntityDefinition<TModel>', () => {
    describe('When TModel has specific column types', () => {
      it('Then returned handler accepts EntityContext<TModel>', () => {
        const db = {} as EntityDbAdapter;
        const handler = createActionHandler(
          tasksDef,
          'complete',
          tasksDef.actions.complete,
          db,
          true,
        );

        // Handler should accept EntityContext<typeof tasksModel>
        const ctx = {} as EntityContext<typeof tasksModel>;
        const _result = handler(ctx, 'task-1', { reason: 'done' });
        void _result;
      });

      it('Then return type is Result<CrudResult, EntityError>', () => {
        const db = {} as EntityDbAdapter;
        const handler = createActionHandler(
          tasksDef,
          'complete',
          tasksDef.actions.complete,
          db,
          true,
        );

        type HandlerReturn = ReturnType<typeof handler>;
        // Return type should be Promise<Result<CrudResult, EntityError>>
        const _check: HandlerReturn = {} as Promise<Result<CrudResult, EntityError>>;
        void _check;
      });
    });
  });

  describe('Given createActionHandler called with unparameterized EntityDefinition', () => {
    describe('When using default ModelDef', () => {
      it('Then types fall back to loose types and still compile', () => {
        const looseDef = {} as EntityDefinition;
        const looseDb = {} as EntityDbAdapter;
        const looseCtx = {} as EntityContext;

        const handler = createActionHandler(
          looseDef,
          'action',
          looseDef.actions.action as EntityActionDef,
          looseDb,
          true,
        );

        // Should accept loose EntityContext
        const _result = handler(looseCtx, 'id', {});
        void _result;
      });
    });
  });

  describe('Given a model type mismatch in the returned handler', () => {
    describe('When calling handler with EntityContext<ProjectsModel> on a tasks action handler', () => {
      it('Then TypeScript reports a type error', () => {
        const db = {} as EntityDbAdapter;
        const handler = createActionHandler(
          tasksDef,
          'complete',
          tasksDef.actions.complete,
          db,
          true,
        );

        // Handler is typed for tasksModel — passing projectsModel context is a type error
        const projectsCtx = {} as EntityContext<typeof projectsModel>;

        // @ts-expect-error — EntityContext<projectsModel> is incompatible with EntityContext<tasksModel>
        handler(projectsCtx, 'task-1', {});
      });
    });
  });

  describe('Given ModelDef and ModelEntry structural compatibility', () => {
    describe('When using EntityDbAdapter<TModel> where TModel extends ModelDef', () => {
      it('Then ModelDef satisfies ModelEntry constraint (structural subtype)', () => {
        // ModelDef structurally extends ModelEntry — both have table and relations
        // This test guards against future interface drift
        type NeedsEntry = <T extends ModelEntry>(adapter: EntityDbAdapter<T>) => void;
        const needsEntry = {} as NeedsEntry;
        const adapter = {} as EntityDbAdapter<typeof tasksModel>;
        needsEntry(adapter); // must compile
      });
    });
  });
});
