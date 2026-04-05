import { describe, it } from 'bun:test';
import type { DatabaseClient } from '../client/database';
import { d } from '../d';
import type {
  FilterType,
  FindResult,
  InsertInput,
  ModelEntry,
  UpdateInput,
} from '../schema/inference';
import type { Equal, Expect, Extends, HasKey, IsFunction, Not } from './_type-helpers';

// ---------------------------------------------------------------------------
// Fixture: minimal schema with relations
// ---------------------------------------------------------------------------

const organizations = d.table('organizations', {
  id: d.uuid().primary(),
  name: d.text(),
  slug: d.text().unique(),
  createdAt: d.timestamp().default('now'),
});

const users = d.table('users', {
  id: d.uuid().primary(),
  organizationId: d.uuid(),
  name: d.text(),
  email: d.email().unique().is('sensitive'),
  passwordHash: d.text().is('hidden'),
  role: d.enum('user_role', ['admin', 'editor', 'viewer']).default('viewer'),
  active: d.boolean().default(true),
  createdAt: d.timestamp().default('now'),
});

const posts = d.table('posts', {
  id: d.uuid().primary(),
  authorId: d.uuid(),
  title: d.text(),
  content: d.text(),
  status: d.enum('post_status', ['draft', 'published', 'archived']).default('draft'),
  views: d.integer().default(0),
  createdAt: d.timestamp().default('now'),
  updatedAt: d.timestamp().default('now'),
});

const comments = d.table('comments', {
  id: d.uuid().primary(),
  postId: d.uuid(),
  authorId: d.uuid(),
  body: d.text(),
  createdAt: d.timestamp().default('now'),
});

const featureFlags = d
  .table('feature_flags', {
    id: d.uuid().primary(),
    name: d.text().unique(),
    enabled: d.boolean().default(false),
  })
  .shared();

// Relations
const postRelations = {
  author: d.ref.one(() => users, 'authorId'),
  comments: d.ref.many(() => comments, 'postId'),
};

const commentRelations = {
  post: d.ref.one(() => posts, 'postId'),
  author: d.ref.one(() => users, 'authorId'),
};

// Model registry
const models = {
  organizations: { table: organizations, relations: {} },
  users: { table: users, relations: {} },
  posts: { table: posts, relations: postRelations },
  comments: { table: comments, relations: commentRelations },
  featureFlags: { table: featureFlags, relations: {} },
} satisfies Record<string, ModelEntry>;

// Type alias for the typed database client
type DB = DatabaseClient<typeof models>;

// ---------------------------------------------------------------------------
// Helper: simulate what a method call would return by testing FindResult
// directly with the models from the registry
// ---------------------------------------------------------------------------

type OrgModel = (typeof models)['organizations'];
type UserModel = (typeof models)['users'];
type PostModel = (typeof models)['posts'];
type CommentModel = (typeof models)['comments'];
type FlagModel = (typeof models)['featureFlags'];

// ---------------------------------------------------------------------------
// Cycle 1: get return type
// ---------------------------------------------------------------------------

describe('Cycle 1: get return type', () => {
  it('returns correct field types for organizations (default select)', () => {
    type Result = FindResult<OrgModel['table'], Record<string, never>, OrgModel['relations']>;

    type _t1 = Expect<HasKey<Result, 'id'>>;
    type _t2 = Expect<HasKey<Result, 'name'>>;
    type _t3 = Expect<HasKey<Result, 'slug'>>;
    type _t4 = Expect<HasKey<Result, 'createdAt'>>;
    type _t5 = Expect<Extends<Result['id'], string>>;
    type _t6 = Expect<Equal<Result['createdAt'], Date>>;
  });

  it('excludes hidden fields by default (passwordHash on users)', () => {
    type Result = FindResult<UserModel['table'], Record<string, never>, UserModel['relations']>;

    type _t1 = Expect<HasKey<Result, 'id'>>;
    type _t2 = Expect<HasKey<Result, 'name'>>;
    type _t3 = Expect<HasKey<Result, 'email'>>;
    type _t4 = Expect<Not<HasKey<Result, 'passwordHash'>>>;
  });

  it('DatabaseClient organizations delegate has get method', () => {
    type _t1 = Expect<IsFunction<DB['organizations']['get']>>;
  });

  it('DatabaseClient organizations delegate has getOrThrow method', () => {
    type _t1 = Expect<IsFunction<DB['organizations']['getOrThrow']>>;
  });
});

// ---------------------------------------------------------------------------
// Cycle 2: list return type
// ---------------------------------------------------------------------------

describe('Cycle 2: list return type', () => {
  it('array elements have correct types', () => {
    type Result = FindResult<PostModel['table'], Record<string, never>, PostModel['relations']>;

    type _t1 = Expect<HasKey<Result, 'id'>>;
    type _t2 = Expect<HasKey<Result, 'title'>>;
    type _t3 = Expect<HasKey<Result, 'content'>>;
    type _t4 = Expect<HasKey<Result, 'views'>>;
    type _t5 = Expect<Extends<Result['views'], number>>;
  });

  it('listAndCount result structure', () => {
    type Element = FindResult<PostModel['table'], Record<string, never>, PostModel['relations']>;
    type Result = { data: Element[]; total: number };

    type _t1 = Expect<HasKey<Result, 'data'>>;
    type _t2 = Expect<HasKey<Result, 'total'>>;
    type _t3 = Expect<HasKey<Result['data'][number], 'id'>>;
    type _t4 = Expect<Extends<Result['total'], number>>;
  });
});

// ---------------------------------------------------------------------------
// Cycle 3: create return type + typed data input
// ---------------------------------------------------------------------------

describe('Cycle 3: create return type + typed data', () => {
  it('InsertInput types require mandatory fields', () => {
    type OrgInsert = InsertInput<typeof organizations>;

    // id, name, slug are required; createdAt is optional (has default)
    const _valid: OrgInsert = {
      id: '123',
      name: 'Acme',
      slug: 'acme',
    };
    void _valid;
  });

  it('InsertInput rejects wrong data types', () => {
    type OrgInsert = InsertInput<typeof organizations>;

    const _bad: OrgInsert = {
      id: '123',
      name: 'Acme',
      slug: 'acme',
      // @ts-expect-error -- createdAt should be Date, not number
      createdAt: 123,
    };
    void _bad;
  });

  it('InsertInput allows omitting defaulted fields', () => {
    type UserInsert = InsertInput<typeof users>;

    // role, active, createdAt have defaults -- can be omitted
    const _valid: UserInsert = {
      organizationId: '111',
      name: 'Alice',
      email: 'alice@example.com',
      passwordHash: 'hash',
    };
    void _valid;
  });
});

// ---------------------------------------------------------------------------
// Cycle 4: update, upsert, delete return types
// ---------------------------------------------------------------------------

describe('Cycle 4: update, upsert, delete return types', () => {
  it('UpdateInput makes all non-PK columns optional', () => {
    type PostUpdate = UpdateInput<typeof posts>;

    const _valid: PostUpdate = {};
    const _partial: PostUpdate = { views: 150 };
    void _valid;
    void _partial;
  });

  it('UpdateInput excludes primary key', () => {
    type PostUpdate = UpdateInput<typeof posts>;

    type _t1 = Expect<Not<HasKey<PostUpdate, 'id'>>>;
  });

  it('featureFlags result has correct fields', () => {
    type Result = FindResult<FlagModel['table'], Record<string, never>, FlagModel['relations']>;

    type _t1 = Expect<HasKey<Result, 'id'>>;
    type _t2 = Expect<HasKey<Result, 'name'>>;
    type _t3 = Expect<HasKey<Result, 'enabled'>>;
    type _t4 = Expect<Extends<Result['enabled'], boolean>>;
  });

  it('comment result has correct fields', () => {
    type Result = FindResult<
      CommentModel['table'],
      Record<string, never>,
      CommentModel['relations']
    >;

    type _t1 = Expect<HasKey<Result, 'id'>>;
    type _t2 = Expect<HasKey<Result, 'body'>>;
    type _t3 = Expect<HasKey<Result, 'postId'>>;
    type _t4 = Expect<HasKey<Result, 'authorId'>>;
  });
});

// ---------------------------------------------------------------------------
// Cycle 5: get with select narrowing
// ---------------------------------------------------------------------------

describe('Cycle 5: select narrowing', () => {
  it('narrows result to selected fields only', () => {
    type Result = FindResult<
      PostModel['table'],
      { select: { id: true; title: true } },
      PostModel['relations']
    >;

    type _t1 = Expect<HasKey<Result, 'id'>>;
    type _t2 = Expect<HasKey<Result, 'title'>>;
    type _t3 = Expect<Not<HasKey<Result, 'content'>>>;
    type _t4 = Expect<Not<HasKey<Result, 'views'>>>;
  });

  it('select with not:sensitive excludes sensitive+hidden fields', () => {
    type Result = FindResult<
      UserModel['table'],
      { select: { not: 'sensitive' } },
      UserModel['relations']
    >;

    type _t1 = Expect<HasKey<Result, 'id'>>;
    type _t2 = Expect<HasKey<Result, 'name'>>;
    type _t3 = Expect<Not<HasKey<Result, 'email'>>>;
    type _t4 = Expect<Not<HasKey<Result, 'passwordHash'>>>;
  });
});

// ---------------------------------------------------------------------------
// Cycle 6: get with include
// ---------------------------------------------------------------------------

describe('Cycle 6: include resolution', () => {
  it('includes one relation as object', () => {
    type Result = FindResult<
      PostModel['table'],
      { include: { author: true } },
      PostModel['relations']
    >;

    type _t1 = Expect<HasKey<Result, 'author'>>;
    type _t2 = Expect<HasKey<Result, 'id'>>;
    type _t3 = Expect<HasKey<Result, 'title'>>;
  });

  it('includes many relation as array', () => {
    type Result = FindResult<
      PostModel['table'],
      { include: { comments: true } },
      PostModel['relations']
    >;

    type _t1 = Expect<HasKey<Result, 'comments'>>;
  });

  it('includes relation with select sub-clause', () => {
    type Result = FindResult<
      PostModel['table'],
      { include: { author: { select: { name: true } } } },
      PostModel['relations']
    >;

    type _t1 = Expect<HasKey<Result, 'author'>>;
  });
});

// ---------------------------------------------------------------------------
// Cycle 7: where/filter typing
// ---------------------------------------------------------------------------

describe('Cycle 7: where/filter typing', () => {
  it('rejects invalid column in where clause via FilterType', () => {
    type PostFilter = FilterType<typeof posts._columns>;

    // @ts-expect-error -- 'invalidColumn' is not a column on posts
    const _bad: PostFilter = { invalidColumn: 'x' };
    void _bad;
  });

  it('rejects wrong type in where value via FilterType', () => {
    type PostFilter = FilterType<typeof posts._columns>;

    // @ts-expect-error -- views is number, not string
    const _bad: PostFilter = { views: 'not-a-number' };
    void _bad;
  });

  it('accepts valid filter values', () => {
    type PostFilter = FilterType<typeof posts._columns>;

    const _ok: PostFilter = { title: 'Hello', views: { gte: 10 } };
    void _ok;
  });

  it('accepts filter operators', () => {
    type PostFilter = FilterType<typeof posts._columns>;

    const _ok: PostFilter = {
      status: { in: ['draft', 'published'] as const },
      title: { contains: 'Post' },
    };
    void _ok;
  });
});

// ---------------------------------------------------------------------------
// Cycle 8: DatabaseClient model delegate method signatures
// ---------------------------------------------------------------------------

describe('Cycle 8: DatabaseClient model delegate method signatures', () => {
  it('posts delegate get method is defined', () => {
    type _t1 = Expect<IsFunction<DB['posts']['get']>>;
  });

  it('posts delegate list method is defined', () => {
    type _t1 = Expect<IsFunction<DB['posts']['list']>>;
  });

  it('posts delegate create method is defined', () => {
    type _t1 = Expect<IsFunction<DB['posts']['create']>>;
  });

  it('posts delegate update method is defined', () => {
    type _t1 = Expect<IsFunction<DB['posts']['update']>>;
  });

  it('posts delegate upsert method is defined', () => {
    type _t1 = Expect<IsFunction<DB['posts']['upsert']>>;
  });

  it('posts delegate delete method is defined', () => {
    type _t1 = Expect<IsFunction<DB['posts']['delete']>>;
  });

  it('posts delegate count method is defined', () => {
    type _t1 = Expect<IsFunction<DB['posts']['count']>>;
  });

  it('posts delegate createMany method is defined', () => {
    type _t1 = Expect<IsFunction<DB['posts']['createMany']>>;
  });

  it('posts delegate createManyAndReturn method is defined', () => {
    type _t1 = Expect<IsFunction<DB['posts']['createManyAndReturn']>>;
  });

  it('top-level query method is defined', () => {
    type _t1 = Expect<IsFunction<DB['query']>>;
  });

  it('_internals.models is accessible', () => {
    type _t1 = Expect<HasKey<DB['_internals'], 'models'>>;
  });
});

// ---------------------------------------------------------------------------
// Typed nested include through DatabaseClient
// ---------------------------------------------------------------------------

describe('Typed nested include through DatabaseClient', () => {
  it('db.posts.get() validates nested include keys', () => {
    type GetOpts = Parameters<DB['posts']['get']>[0];
    type IncludeField = NonNullable<NonNullable<GetOpts>['include']>;

    const _valid: IncludeField = {
      comments: {
        include: {
          author: true,
        },
      },
    };
    void _valid;
  });

  it('db.posts.get() rejects invalid nested include keys', () => {
    type GetOpts = Parameters<DB['posts']['get']>[0];
    type IncludeField = NonNullable<NonNullable<GetOpts>['include']>;

    const _invalid: IncludeField = {
      comments: {
        // @ts-expect-error — 'bogus' is not a relation on comments
        include: { bogus: true },
      },
    };
    void _invalid;
  });

  it('db.posts.list() validates nested include keys', () => {
    type ListOpts = Parameters<DB['posts']['list']>[0];
    type IncludeField = NonNullable<NonNullable<ListOpts>['include']>;

    const _valid: IncludeField = {
      comments: {
        include: {
          post: true,
        },
      },
    };
    void _valid;
  });

  it('TransactionClient has same nested include typing', () => {
    type TxPostDelegate = DB extends { transaction: (fn: infer F) => unknown }
      ? F extends (tx: infer TX) => unknown
        ? TX extends { posts: infer P }
          ? P
          : never
        : never
      : never;

    type TxGetOpts = TxPostDelegate extends { get: (opts?: infer O) => unknown } ? O : never;
    type TxInclude = NonNullable<NonNullable<TxGetOpts>['include']>;

    const _valid: TxInclude = {
      comments: {
        include: {
          author: true,
        },
      },
    };
    void _valid;
  });
});
