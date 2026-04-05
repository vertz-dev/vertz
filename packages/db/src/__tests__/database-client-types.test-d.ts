import { describe, it } from 'bun:test';
import type { DatabaseClient, ModelDelegate } from '../client/database';
import { d } from '../d';
import type { ModelEntry } from '../schema/inference';
import type { Equal, Expect, Extends, HasKey, IsFunction } from './_type-helpers';

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
  authorId: d.uuid(),
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
    type _t1 = Expect<Extends<DB['users'], ModelDelegate<UsersModel, typeof models>>>;
  });

  it('db.posts is a ModelDelegate typed for posts', () => {
    type _t1 = Expect<Extends<DB['posts'], ModelDelegate<PostsModel, typeof models>>>;
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
    type _t1 = Expect<IsFunction<DB['users']['get']>>;
  });

  it('getOrThrow method exists', () => {
    type _t1 = Expect<IsFunction<DB['users']['getOrThrow']>>;
  });

  it('list method exists', () => {
    type _t1 = Expect<IsFunction<DB['users']['list']>>;
  });

  it('listAndCount method exists', () => {
    type _t1 = Expect<IsFunction<DB['users']['listAndCount']>>;
  });

  it('create method exists', () => {
    type _t1 = Expect<IsFunction<DB['users']['create']>>;
  });

  it('createMany method exists', () => {
    type _t1 = Expect<IsFunction<DB['users']['createMany']>>;
  });

  it('createManyAndReturn method exists', () => {
    type _t1 = Expect<IsFunction<DB['users']['createManyAndReturn']>>;
  });

  it('update method exists', () => {
    type _t1 = Expect<IsFunction<DB['users']['update']>>;
  });

  it('updateMany method exists', () => {
    type _t1 = Expect<IsFunction<DB['users']['updateMany']>>;
  });

  it('upsert method exists', () => {
    type _t1 = Expect<IsFunction<DB['users']['upsert']>>;
  });

  it('delete method exists', () => {
    type _t1 = Expect<IsFunction<DB['users']['delete']>>;
  });

  it('deleteMany method exists', () => {
    type _t1 = Expect<IsFunction<DB['users']['deleteMany']>>;
  });

  it('count method exists', () => {
    type _t1 = Expect<IsFunction<DB['users']['count']>>;
  });

  it('aggregate method exists', () => {
    type _t1 = Expect<IsFunction<DB['users']['aggregate']>>;
  });

  it('groupBy method exists', () => {
    type _t1 = Expect<IsFunction<DB['users']['groupBy']>>;
  });
});

// ---------------------------------------------------------------------------
// 3. Top-level methods exist
// ---------------------------------------------------------------------------

describe('Top-level methods exist', () => {
  it('query method exists', () => {
    type _t1 = Expect<IsFunction<DB['query']>>;
  });

  it('close method exists', () => {
    type _t1 = Expect<IsFunction<DB['close']>>;
  });

  it('isHealthy method exists', () => {
    type _t1 = Expect<IsFunction<DB['isHealthy']>>;
  });
});

// ---------------------------------------------------------------------------
// 4. _internals groups internal properties
// ---------------------------------------------------------------------------

describe('_internals groups internal properties', () => {
  it('_internals.models is the TModels type', () => {
    type _t1 = Expect<Equal<DB['_internals']['models'], typeof models>>;
  });

  it('_internals.dialect exists', () => {
    type _t1 = Expect<HasKey<DB['_internals'], 'dialect'>>;
  });

  it('_internals.tenantGraph exists', () => {
    type _t1 = Expect<HasKey<DB['_internals'], 'tenantGraph'>>;
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
