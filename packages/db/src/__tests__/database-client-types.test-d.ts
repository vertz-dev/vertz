import { describe, expectTypeOf, it } from 'vitest';
import type { DatabaseClient, ModelDelegate } from '../client/database';
import { d } from '../d';
import type { ModelEntry } from '../schema/inference';

// ---------------------------------------------------------------------------
// Fixture: minimal schema with relations
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  email: d.email().unique(),
  secret: d.text().is('hidden'),
  createdAt: d.timestamp().default('now'),
});

const postsTable = d.table('posts', {
  id: d.uuid().primary(),
  authorId: d.uuid().references('users', 'id'),
  title: d.text(),
  content: d.text(),
  createdAt: d.timestamp().default('now'),
});

const postRelations = {
  author: d.ref.one(() => usersTable, 'authorId'),
};

const models = {
  users: { table: usersTable, relations: {} },
  posts: { table: postsTable, relations: postRelations },
} satisfies Record<string, ModelEntry>;

type DB = DatabaseClient<typeof models>;
type UsersModel = (typeof models)['users'];
type PostsModel = (typeof models)['posts'];

// ---------------------------------------------------------------------------
// 1. Model delegates exist as typed properties
// ---------------------------------------------------------------------------

describe('Model delegates exist as typed properties', () => {
  it('db.users is a ModelDelegate typed for users', () => {
    expectTypeOf<DB['users']>().toMatchTypeOf<ModelDelegate<UsersModel>>();
  });

  it('db.posts is a ModelDelegate typed for posts', () => {
    expectTypeOf<DB['posts']>().toMatchTypeOf<ModelDelegate<PostsModel>>();
  });

  it('non-existent model key is a compile error', () => {
    // @ts-expect-error — 'nonexistent' is not a key of models
    type _Bad = DB['nonexistent'];
  });
});

// ---------------------------------------------------------------------------
// 2. Model delegate has all CRUD methods
// ---------------------------------------------------------------------------

describe('Model delegate has all CRUD methods', () => {
  it('get method exists', () => {
    expectTypeOf<DB['users']['get']>().toBeFunction();
  });

  it('getOrThrow method exists', () => {
    expectTypeOf<DB['users']['getOrThrow']>().toBeFunction();
  });

  it('list method exists', () => {
    expectTypeOf<DB['users']['list']>().toBeFunction();
  });

  it('listAndCount method exists', () => {
    expectTypeOf<DB['users']['listAndCount']>().toBeFunction();
  });

  it('create method exists', () => {
    expectTypeOf<DB['users']['create']>().toBeFunction();
  });

  it('createMany method exists', () => {
    expectTypeOf<DB['users']['createMany']>().toBeFunction();
  });

  it('createManyAndReturn method exists', () => {
    expectTypeOf<DB['users']['createManyAndReturn']>().toBeFunction();
  });

  it('update method exists', () => {
    expectTypeOf<DB['users']['update']>().toBeFunction();
  });

  it('updateMany method exists', () => {
    expectTypeOf<DB['users']['updateMany']>().toBeFunction();
  });

  it('upsert method exists', () => {
    expectTypeOf<DB['users']['upsert']>().toBeFunction();
  });

  it('delete method exists', () => {
    expectTypeOf<DB['users']['delete']>().toBeFunction();
  });

  it('deleteMany method exists', () => {
    expectTypeOf<DB['users']['deleteMany']>().toBeFunction();
  });

  it('count method exists', () => {
    expectTypeOf<DB['users']['count']>().toBeFunction();
  });

  it('aggregate method exists', () => {
    expectTypeOf<DB['users']['aggregate']>().toBeFunction();
  });

  it('groupBy method exists', () => {
    expectTypeOf<DB['users']['groupBy']>().toBeFunction();
  });
});

// ---------------------------------------------------------------------------
// 3. Top-level methods exist
// ---------------------------------------------------------------------------

describe('Top-level methods exist', () => {
  it('query method exists', () => {
    expectTypeOf<DB['query']>().toBeFunction();
  });

  it('close method exists', () => {
    expectTypeOf<DB['close']>().toBeFunction();
  });

  it('isHealthy method exists', () => {
    expectTypeOf<DB['isHealthy']>().toBeFunction();
  });
});

// ---------------------------------------------------------------------------
// 4. _internals groups internal properties
// ---------------------------------------------------------------------------

describe('_internals groups internal properties', () => {
  it('_internals.models is the TModels type', () => {
    expectTypeOf<DB['_internals']['models']>().toEqualTypeOf<typeof models>();
  });

  it('_internals.dialect exists', () => {
    expectTypeOf<DB['_internals']>().toHaveProperty('dialect');
  });

  it('_internals.tenantGraph exists', () => {
    expectTypeOf<DB['_internals']>().toHaveProperty('tenantGraph');
  });
});

// ---------------------------------------------------------------------------
// 5. Old DatabaseInstance shape does NOT exist on DatabaseClient
// ---------------------------------------------------------------------------

describe('Old API shape does not exist', () => {
  it('no top-level CRUD methods or old internal properties', () => {
    // Old db.get(tableName, opts) — should not exist
    // @ts-expect-error — DatabaseClient has no top-level 'get' method
    type _OldGet = DB['get'];

    // Old db.create(tableName, opts) — should not exist
    // @ts-expect-error — DatabaseClient has no top-level 'create' method
    type _OldCreate = DB['create'];

    // Old db.list(tableName, opts) — should not exist
    // @ts-expect-error — DatabaseClient has no top-level 'list' method
    type _OldList = DB['list'];

    // Old db.update(tableName, opts) — should not exist
    // @ts-expect-error — DatabaseClient has no top-level 'update' method
    type _OldUpdate = DB['update'];

    // Old db.delete(tableName, opts) — should not exist
    // @ts-expect-error — DatabaseClient has no top-level 'delete' method
    type _OldDelete = DB['delete'];

    // Old db._models — should not exist at top level
    // @ts-expect-error — use db._internals.models instead
    type _OldModels = DB['_models'];

    // Old db._dialect — should not exist at top level
    // @ts-expect-error — use db._internals.dialect instead
    type _OldDialect = DB['_dialect'];

    // Old db.$tenantGraph — should not exist at top level
    // @ts-expect-error — use db._internals.tenantGraph instead
    type _OldTenantGraph = DB['$tenantGraph'];
  });
});
