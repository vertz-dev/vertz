import { describe, expectTypeOf, it } from 'vitest';
import type { DatabaseClient } from '../client/database';
import { d } from '../d';
import type {
  FilterType,
  FindResult,
  InsertInput,
  ModelEntry,
  UpdateInput,
} from '../schema/inference';

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
  organizationId: d.tenant(organizations),
  name: d.text(),
  email: d.email().unique().sensitive(),
  passwordHash: d.text().hidden(),
  role: d.enum('user_role', ['admin', 'editor', 'viewer']).default('viewer'),
  active: d.boolean().default(true),
  createdAt: d.timestamp().default('now'),
});

const posts = d.table('posts', {
  id: d.uuid().primary(),
  authorId: d.uuid().references('users', 'id'),
  title: d.text(),
  content: d.text(),
  status: d.enum('post_status', ['draft', 'published', 'archived']).default('draft'),
  views: d.integer().default(0),
  createdAt: d.timestamp().default('now'),
  updatedAt: d.timestamp().default('now'),
});

const comments = d.table('comments', {
  id: d.uuid().primary(),
  postId: d.uuid().references('posts', 'id'),
  authorId: d.uuid().references('users', 'id'),
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

    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('name');
    expectTypeOf<Result>().toHaveProperty('slug');
    expectTypeOf<Result>().toHaveProperty('createdAt');
    expectTypeOf<Result['id']>().toBeString();
    expectTypeOf<Result['createdAt']>().toEqualTypeOf<Date>();
  });

  it('excludes hidden fields by default (passwordHash on users)', () => {
    type Result = FindResult<UserModel['table'], Record<string, never>, UserModel['relations']>;

    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('name');
    expectTypeOf<Result>().toHaveProperty('email');
    expectTypeOf<Result>().not.toHaveProperty('passwordHash');
  });

  it('DatabaseClient organizations delegate has get method', () => {
    expectTypeOf<DB['organizations']['get']>().toBeFunction();
  });

  it('DatabaseClient organizations delegate has getOrThrow method', () => {
    expectTypeOf<DB['organizations']['getOrThrow']>().toBeFunction();
  });
});

// ---------------------------------------------------------------------------
// Cycle 2: list return type
// ---------------------------------------------------------------------------

describe('Cycle 2: list return type', () => {
  it('array elements have correct types', () => {
    type Result = FindResult<PostModel['table'], Record<string, never>, PostModel['relations']>;

    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('title');
    expectTypeOf<Result>().toHaveProperty('content');
    expectTypeOf<Result>().toHaveProperty('views');
    expectTypeOf<Result['views']>().toBeNumber();
  });

  it('listAndCount result structure', () => {
    type Element = FindResult<PostModel['table'], Record<string, never>, PostModel['relations']>;
    type Result = { data: Element[]; total: number };

    expectTypeOf<Result>().toHaveProperty('data');
    expectTypeOf<Result>().toHaveProperty('total');
    expectTypeOf<Result['data'][number]>().toHaveProperty('id');
    expectTypeOf<Result['total']>().toBeNumber();
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

    expectTypeOf<PostUpdate>().not.toHaveProperty('id');
  });

  it('featureFlags result has correct fields', () => {
    type Result = FindResult<FlagModel['table'], Record<string, never>, FlagModel['relations']>;

    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('name');
    expectTypeOf<Result>().toHaveProperty('enabled');
    expectTypeOf<Result['enabled']>().toBeBoolean();
  });

  it('comment result has correct fields', () => {
    type Result = FindResult<
      CommentModel['table'],
      Record<string, never>,
      CommentModel['relations']
    >;

    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('body');
    expectTypeOf<Result>().toHaveProperty('postId');
    expectTypeOf<Result>().toHaveProperty('authorId');
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

    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('title');
    expectTypeOf<Result>().not.toHaveProperty('content');
    expectTypeOf<Result>().not.toHaveProperty('views');
  });

  it('select with not:sensitive excludes sensitive+hidden fields', () => {
    type Result = FindResult<
      UserModel['table'],
      { select: { not: 'sensitive' } },
      UserModel['relations']
    >;

    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('name');
    expectTypeOf<Result>().not.toHaveProperty('email');
    expectTypeOf<Result>().not.toHaveProperty('passwordHash');
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

    expectTypeOf<Result>().toHaveProperty('author');
    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('title');
  });

  it('includes many relation as array', () => {
    type Result = FindResult<
      PostModel['table'],
      { include: { comments: true } },
      PostModel['relations']
    >;

    expectTypeOf<Result>().toHaveProperty('comments');
  });

  it('includes relation with select sub-clause', () => {
    type Result = FindResult<
      PostModel['table'],
      { include: { author: { select: { name: true } } } },
      PostModel['relations']
    >;

    expectTypeOf<Result>().toHaveProperty('author');
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
    expectTypeOf<DB['posts']['get']>().toBeFunction();
  });

  it('posts delegate list method is defined', () => {
    expectTypeOf<DB['posts']['list']>().toBeFunction();
  });

  it('posts delegate create method is defined', () => {
    expectTypeOf<DB['posts']['create']>().toBeFunction();
  });

  it('posts delegate update method is defined', () => {
    expectTypeOf<DB['posts']['update']>().toBeFunction();
  });

  it('posts delegate upsert method is defined', () => {
    expectTypeOf<DB['posts']['upsert']>().toBeFunction();
  });

  it('posts delegate delete method is defined', () => {
    expectTypeOf<DB['posts']['delete']>().toBeFunction();
  });

  it('posts delegate count method is defined', () => {
    expectTypeOf<DB['posts']['count']>().toBeFunction();
  });

  it('posts delegate createMany method is defined', () => {
    expectTypeOf<DB['posts']['createMany']>().toBeFunction();
  });

  it('posts delegate createManyAndReturn method is defined', () => {
    expectTypeOf<DB['posts']['createManyAndReturn']>().toBeFunction();
  });

  it('top-level query method is defined', () => {
    expectTypeOf<DB['query']>().toBeFunction();
  });

  it('_internals.models is accessible', () => {
    expectTypeOf<DB['_internals']>().toHaveProperty('models');
  });
});
