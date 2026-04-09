import { describe, it } from '@vertz/test';
import { d, type EntityDbAdapter } from '@vertz/db';
import type { EntityError, Result } from '@vertz/errors';
import type { CrudHandlers, CrudResult, ListResult } from '../crud-pipeline';
import { createCrudHandlers } from '../crud-pipeline';
import { entity } from '../entity';
import type { EntityContext, EntityDefinition } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tasksTable = d.table('tasks', {
  id: d.uuid().primary(),
  title: d.text(),
  status: d.text(),
  secret: d.text().is('hidden'),
  createdAt: d.timestamp().default('now').readOnly(),
});

const tasksModel = d.model(tasksTable);
type TasksModel = typeof tasksModel;

const projectsTable = d.table('projects', {
  id: d.uuid().primary(),
  name: d.text(),
});

const projectsModel = d.model(projectsTable);

const tasksDef = entity('tasks', {
  model: tasksModel,
  access: {
    list: () => true,
    get: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
});

// ---------------------------------------------------------------------------
// Type tests: CrudHandlers generic threading
// ---------------------------------------------------------------------------

describe('Feature: CRUD pipeline model generics', () => {
  describe('Given createCrudHandlers called with EntityDefinition<TModel>', () => {
    describe('When TModel has specific column types', () => {
      it('Then get() return type uses $response', () => {
        const db = {} as EntityDbAdapter;
        const handlers = createCrudHandlers(tasksDef, db);
        const ctx = {} as EntityContext<TasksModel>;

        type GetResult = Awaited<ReturnType<typeof handlers.get>>;
        // If ok, body should be typed as $response (has title, not secret)
        type GetBody = Extract<GetResult, { ok: true }>['data']['body'];

        // title should be a string in $response
        const _check: GetBody['title'] = '' as string;
        void _check;
      });

      it('Then create() return type uses $response', () => {
        const db = {} as EntityDbAdapter;
        const handlers = createCrudHandlers(tasksDef, db);

        type CreateResult = Awaited<ReturnType<typeof handlers.create>>;
        type CreateBody = Extract<CreateResult, { ok: true }>['data']['body'];

        // title should be a string in $response
        const _check: CreateBody['title'] = '' as string;
        void _check;
      });

      it('Then update() return type uses $response', () => {
        const db = {} as EntityDbAdapter;
        const handlers = createCrudHandlers(tasksDef, db);

        type UpdateResult = Awaited<ReturnType<typeof handlers.update>>;
        type UpdateBody = Extract<UpdateResult, { ok: true }>['data']['body'];

        // title should be a string in $response
        const _check: UpdateBody['title'] = '' as string;
        void _check;
      });

      it('Then list() return type uses ListResult<$response>', () => {
        const db = {} as EntityDbAdapter;
        const handlers = createCrudHandlers(tasksDef, db);

        type ListResultType = Awaited<ReturnType<typeof handlers.list>>;
        type ListBody = Extract<ListResultType, { ok: true }>['data']['body'];

        // items should be typed arrays with $response shape
        type ItemType = ListBody['items'][number];
        const _check: ItemType['title'] = '' as string;
        void _check;
      });

      it('Then ctx parameters use EntityContext<TModel>', () => {
        const db = {} as EntityDbAdapter;
        const handlers = createCrudHandlers(tasksDef, db);

        // Should accept EntityContext<TasksModel>
        const ctx = {} as EntityContext<TasksModel>;
        handlers.get(ctx, 'id');
        handlers.create(ctx, {});
        handlers.update(ctx, 'id', {});
        handlers.delete(ctx, 'id');
      });
    });
  });

  describe('Given createCrudHandlers with unparameterized EntityDefinition', () => {
    describe('When using default ModelDef', () => {
      it('Then types fall back to loose defaults', () => {
        const looseDef = {} as EntityDefinition;
        const looseDb = {} as EntityDbAdapter;
        const looseCtx = {} as EntityContext;

        const handlers = createCrudHandlers(looseDef, looseDb);

        // Should accept loose EntityContext
        handlers.get(looseCtx, 'id');
        handlers.create(looseCtx, {});
      });
    });
  });

  describe('Given a model mismatch in CrudHandlers', () => {
    describe('When calling get() with EntityContext<ProjectsModel> on tasks CrudHandlers', () => {
      it('Then TypeScript reports a type error', () => {
        const db = {} as EntityDbAdapter;
        const handlers = createCrudHandlers(tasksDef, db);

        // handlers is typed for tasksModel — passing projectsModel context is a type error
        const projectsCtx = {} as EntityContext<typeof projectsModel>;

        // @ts-expect-error — EntityContext<projectsModel> is incompatible with EntityContext<tasksModel>
        handlers.get(projectsCtx, 'id');
      });
    });
  });
});
