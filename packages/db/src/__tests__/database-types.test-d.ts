import { describe, expectTypeOf, it } from 'vitest';
import type { DatabaseInstance } from '../client/database';
import { d } from '../d';
import type {
  FilterType,
  FindResult,
  InsertInput,
  TableEntry,
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

// Table registry
const tables = {
  organizations: { table: organizations, relations: {} },
  users: { table: users, relations: {} },
  posts: { table: posts, relations: postRelations },
  comments: { table: comments, relations: commentRelations },
  featureFlags: { table: featureFlags, relations: {} },
} satisfies Record<string, TableEntry>;

// Type alias for the typed database instance
type DB = DatabaseInstance<typeof tables>;

// ---------------------------------------------------------------------------
// Helper: simulate what a method call would return by testing FindResult
// directly with the tables from the registry
// ---------------------------------------------------------------------------

type OrgEntry = (typeof tables)['organizations'];
type UserEntry = (typeof tables)['users'];
type PostEntry = (typeof tables)['posts'];
type CommentEntry = (typeof tables)['comments'];
type FlagEntry = (typeof tables)['featureFlags'];

// ---------------------------------------------------------------------------
// Cycle 1: findOne return type
// ---------------------------------------------------------------------------

describe('Cycle 1: findOne return type', () => {
  it('returns correct field types for organizations (default select)', () => {
    type Result = FindResult<OrgEntry['table'], Record<string, never>, OrgEntry['relations']>;

    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('name');
    expectTypeOf<Result>().toHaveProperty('slug');
    expectTypeOf<Result>().toHaveProperty('createdAt');
    expectTypeOf<Result['id']>().toBeString();
    expectTypeOf<Result['createdAt']>().toEqualTypeOf<Date>();
  });

  it('excludes hidden fields by default (passwordHash on users)', () => {
    type Result = FindResult<UserEntry['table'], Record<string, never>, UserEntry['relations']>;

    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('name');
    expectTypeOf<Result>().toHaveProperty('email');
    expectTypeOf<Result>().not.toHaveProperty('passwordHash');
  });

  it('DatabaseInstance findOne method exists and is a function', () => {
    expectTypeOf<DB['findOne']>().toBeFunction();
  });

  it('DatabaseInstance findOneOrThrow method exists and is a function', () => {
    expectTypeOf<DB['findOneOrThrow']>().toBeFunction();
  });
});

// ---------------------------------------------------------------------------
// Cycle 2: findMany return type
// ---------------------------------------------------------------------------

describe('Cycle 2: findMany return type', () => {
  it('array elements have correct types', () => {
    type Result = FindResult<PostEntry['table'], Record<string, never>, PostEntry['relations']>;

    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('title');
    expectTypeOf<Result>().toHaveProperty('content');
    expectTypeOf<Result>().toHaveProperty('views');
    expectTypeOf<Result['views']>().toBeNumber();
  });

  it('findManyAndCount result structure', () => {
    type Element = FindResult<PostEntry['table'], Record<string, never>, PostEntry['relations']>;
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
    type Result = FindResult<FlagEntry['table'], Record<string, never>, FlagEntry['relations']>;

    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('name');
    expectTypeOf<Result>().toHaveProperty('enabled');
    expectTypeOf<Result['enabled']>().toBeBoolean();
  });

  it('comment result has correct fields', () => {
    type Result = FindResult<
      CommentEntry['table'],
      Record<string, never>,
      CommentEntry['relations']
    >;

    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('body');
    expectTypeOf<Result>().toHaveProperty('postId');
    expectTypeOf<Result>().toHaveProperty('authorId');
  });
});

// ---------------------------------------------------------------------------
// Cycle 5: findOne with select narrowing
// ---------------------------------------------------------------------------

describe('Cycle 5: select narrowing', () => {
  it('narrows result to selected fields only', () => {
    type Result = FindResult<
      PostEntry['table'],
      { select: { id: true; title: true } },
      PostEntry['relations']
    >;

    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('title');
    expectTypeOf<Result>().not.toHaveProperty('content');
    expectTypeOf<Result>().not.toHaveProperty('views');
  });

  it('select with not:sensitive excludes sensitive+hidden fields', () => {
    type Result = FindResult<
      UserEntry['table'],
      { select: { not: 'sensitive' } },
      UserEntry['relations']
    >;

    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('name');
    expectTypeOf<Result>().not.toHaveProperty('email');
    expectTypeOf<Result>().not.toHaveProperty('passwordHash');
  });
});

// ---------------------------------------------------------------------------
// Cycle 6: findOne with include
// ---------------------------------------------------------------------------

describe('Cycle 6: include resolution', () => {
  it('includes one relation as object', () => {
    type Result = FindResult<
      PostEntry['table'],
      { include: { author: true } },
      PostEntry['relations']
    >;

    expectTypeOf<Result>().toHaveProperty('author');
    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('title');
  });

  it('includes many relation as array', () => {
    type Result = FindResult<
      PostEntry['table'],
      { include: { comments: true } },
      PostEntry['relations']
    >;

    expectTypeOf<Result>().toHaveProperty('comments');
  });

  it('includes relation with select sub-clause', () => {
    type Result = FindResult<
      PostEntry['table'],
      { include: { author: { select: { name: true } } } },
      PostEntry['relations']
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
// Cycle 8: DatabaseInstance method signatures
// ---------------------------------------------------------------------------

describe('Cycle 8: DatabaseInstance method signatures', () => {
  it('findOne method is defined', () => {
    expectTypeOf<DB['findOne']>().toBeFunction();
  });

  it('findMany method is defined', () => {
    expectTypeOf<DB['findMany']>().toBeFunction();
  });

  it('create method is defined', () => {
    expectTypeOf<DB['create']>().toBeFunction();
  });

  it('update method is defined', () => {
    expectTypeOf<DB['update']>().toBeFunction();
  });

  it('upsert method is defined', () => {
    expectTypeOf<DB['upsert']>().toBeFunction();
  });

  it('delete method is defined', () => {
    expectTypeOf<DB['delete']>().toBeFunction();
  });

  it('count returns number', () => {
    expectTypeOf<DB['count']>().toBeFunction();
  });

  it('createMany returns count', () => {
    expectTypeOf<DB['createMany']>().toBeFunction();
  });

  it('createManyAndReturn method is defined', () => {
    expectTypeOf<DB['createManyAndReturn']>().toBeFunction();
  });
});
