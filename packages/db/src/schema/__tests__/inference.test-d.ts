import { describe, it } from 'bun:test';
import type { Equal, Expect, Extends, HasKey, Not } from '../../__tests__/_type-helpers';
import { d } from '../../d';
import type {
  Database,
  FilterType,
  FindResult,
  IncludeOption,
  IncludeResolve,
  InsertInput,
  ModelEntry,
  OrderByType,
  SelectNarrow,
  SelectOption,
  UpdateInput,
} from '../inference';

// ---------------------------------------------------------------------------
// Fixture tables
// ---------------------------------------------------------------------------

const users = d.table('users', {
  id: d.uuid().primary(),
  email: d.email().unique().is('sensitive'),
  passwordHash: d.text().is('hidden'),
  name: d.text(),
  role: d.enum('user_role', ['admin', 'editor', 'viewer']).default('viewer'),
  bio: d.text().nullable(),
  active: d.boolean().default(true),
  createdAt: d.timestamp().default('now'),
  age: d.integer().nullable(),
  score: d.real(),
});

const posts = d.table('posts', {
  id: d.uuid().primary(),
  title: d.text(),
  body: d.text(),
  published: d.boolean().default(false),
  authorId: d.uuid(),
  createdAt: d.timestamp().default('now'),
});

const comments = d.table('comments', {
  id: d.uuid().primary(),
  text: d.text(),
  postId: d.uuid(),
  authorId: d.uuid(),
});

// Relations for posts
const postRelations = {
  author: d.ref.one(() => users, 'authorId'),
  comments: d.ref.many(() => comments, 'postId'),
};

// Relations for comments
const commentRelations = {
  post: d.ref.one(() => posts, 'postId'),
  author: d.ref.one(() => users, 'authorId'),
};

// ---------------------------------------------------------------------------
// FilterType — typed where filters
// ---------------------------------------------------------------------------

describe('FilterType', () => {
  it('allows direct value shorthand for filters', () => {
    type UserFilter = FilterType<typeof users._columns>;

    const _filter: UserFilter = {
      name: 'John',
      active: true,
    };
    void _filter;
  });

  it('allows eq operator matching column type', () => {
    type UserFilter = FilterType<typeof users._columns>;

    const _filter: UserFilter = {
      name: { eq: 'John' },
      active: { eq: true },
      age: { eq: 30 },
    };
    void _filter;
  });

  it('allows comparison operators for number columns', () => {
    type UserFilter = FilterType<typeof users._columns>;

    const _filter: UserFilter = {
      age: { gt: 18, lte: 65 },
    };
    void _filter;
  });

  it('allows comparison operators for string columns', () => {
    type UserFilter = FilterType<typeof users._columns>;

    const _filter: UserFilter = {
      name: { gte: 'A', lt: 'Z' },
    };
    void _filter;
  });

  it('allows in/notIn with array of matching type', () => {
    type UserFilter = FilterType<typeof users._columns>;

    const _filter: UserFilter = {
      role: { in: ['admin', 'editor'] as const },
      name: { notIn: ['banned1', 'banned2'] },
    };
    void _filter;
  });

  it('allows string operators on string columns', () => {
    type UserFilter = FilterType<typeof users._columns>;

    const _filter: UserFilter = {
      name: { contains: 'oh', startsWith: 'J', endsWith: 'n' },
    };
    void _filter;
  });

  it('allows isNull on nullable columns', () => {
    type UserFilter = FilterType<typeof users._columns>;

    const _filter: UserFilter = {
      bio: { isNull: true },
      age: { isNull: false },
    };
    void _filter;
  });

  it('rejects wrong type in filter value', () => {
    type UserFilter = FilterType<typeof users._columns>;

    // @ts-expect-error -- name is string, cannot filter with number
    const _bad: UserFilter = { name: 42 };
    void _bad;
  });

  it('rejects wrong type in eq operator', () => {
    type UserFilter = FilterType<typeof users._columns>;

    // @ts-expect-error -- age is number|null, cannot use string in eq
    const _bad: UserFilter = { age: { eq: 'not-a-number' } };
    void _bad;
  });

  it('rejects wrong type in in operator', () => {
    type UserFilter = FilterType<typeof users._columns>;

    // @ts-expect-error -- role is enum string type, cannot use numbers in array
    const _bad: UserFilter = { role: { in: [1, 2, 3] } };
    void _bad;
  });

  it('rejects non-existent column in where clause', () => {
    type UserFilter = FilterType<typeof users._columns>;

    // @ts-expect-error -- 'nonExistent' is not a column on users
    const _bad: UserFilter = { nonExistent: 'value' };
    void _bad;
  });

  it('allows all filter keys to be optional', () => {
    type UserFilter = FilterType<typeof users._columns>;

    const _empty: UserFilter = {};
    void _empty;
  });
});

// ---------------------------------------------------------------------------
// OrderByType — constrained to column names with 'asc' | 'desc'
// ---------------------------------------------------------------------------

describe('OrderByType', () => {
  it('allows valid column with asc/desc', () => {
    type UserOrderBy = OrderByType<typeof users._columns>;

    const _orderBy: UserOrderBy = {
      name: 'asc',
      createdAt: 'desc',
    };
    void _orderBy;
  });

  it('constrains keys to column names only', () => {
    type UserOrderBy = OrderByType<typeof users._columns>;

    // @ts-expect-error -- 'nonExistent' is not a column
    const _bad: UserOrderBy = { nonExistent: 'asc' };
    void _bad;
  });

  it('constrains values to asc | desc only', () => {
    type UserOrderBy = OrderByType<typeof users._columns>;

    // @ts-expect-error -- 'ascending' is not a valid order direction
    const _bad: UserOrderBy = { name: 'ascending' };
    void _bad;
  });
});

// ---------------------------------------------------------------------------
// SelectOption — mutual exclusivity
// ---------------------------------------------------------------------------

describe('SelectOption', () => {
  it('allows not: sensitive', () => {
    type UserSelect = SelectOption<typeof users._columns>;

    const _select: UserSelect = { not: 'sensitive' };
    void _select;
  });

  it('allows not: hidden', () => {
    type UserSelect = SelectOption<typeof users._columns>;

    const _select: UserSelect = { not: 'hidden' };
    void _select;
  });

  it('allows explicit field selection', () => {
    type UserSelect = SelectOption<typeof users._columns>;

    const _select: UserSelect = { id: true, name: true };
    void _select;
  });

  it('produces a type error when combining not with explicit select', () => {
    type UserSelect = SelectOption<typeof users._columns>;

    // @ts-expect-error -- cannot combine not with explicit field selection
    const _bad: UserSelect = { not: 'sensitive', id: true };
    void _bad;
  });

  it('does not allow unknown column names in explicit select', () => {
    type UserSelect = SelectOption<typeof users._columns>;

    // @ts-expect-error -- 'bogus' is not a column
    const _bad: UserSelect = { bogus: true };
    void _bad;
  });
});

// ---------------------------------------------------------------------------
// SelectNarrow — narrows result to selected fields
// ---------------------------------------------------------------------------

describe('SelectNarrow', () => {
  it('narrows to picked fields when select has explicit keys', () => {
    type Result = SelectNarrow<typeof users._columns, { id: true; name: true }>;

    type _t1 = Expect<HasKey<Result, 'id'>>;
    type _t2 = Expect<HasKey<Result, 'name'>>;
    type _t3 = Expect<Not<HasKey<Result, 'email'>>>;
    type _t4 = Expect<Not<HasKey<Result, 'passwordHash'>>>;
    type _t5 = Expect<Not<HasKey<Result, 'role'>>>;
  });

  it('preserves correct types on narrowed fields', () => {
    type Result = SelectNarrow<typeof users._columns, { id: true; bio: true; active: true }>;

    type _t1 = Expect<Equal<Result['id'], string>>;
    type _t2 = Expect<Equal<Result['bio'], string | null>>;
    type _t3 = Expect<Equal<Result['active'], boolean>>;
  });

  it('excludes sensitive columns when not: sensitive', () => {
    type Result = SelectNarrow<typeof users._columns, { not: 'sensitive' }>;

    // email is sensitive, passwordHash is hidden -- both excluded
    type _t1 = Expect<Not<HasKey<Result, 'email'>>>;
    type _t2 = Expect<Not<HasKey<Result, 'passwordHash'>>>;

    // Normal columns included
    type _t3 = Expect<HasKey<Result, 'id'>>;
    type _t4 = Expect<HasKey<Result, 'name'>>;
    type _t5 = Expect<HasKey<Result, 'role'>>;
  });

  it('excludes hidden columns when not: hidden', () => {
    type Result = SelectNarrow<typeof users._columns, { not: 'hidden' }>;

    // passwordHash is hidden -- excluded
    type _t1 = Expect<Not<HasKey<Result, 'passwordHash'>>>;

    // email is sensitive but NOT hidden -- included
    type _t2 = Expect<HasKey<Result, 'email'>>;
    type _t3 = Expect<HasKey<Result, 'id'>>;
    type _t4 = Expect<HasKey<Result, 'name'>>;
  });

  it('defaults to excluding hidden columns (same as $infer)', () => {
    type Result = SelectNarrow<typeof users._columns, undefined>;

    type _t1 = Expect<Not<HasKey<Result, 'passwordHash'>>>;
    type _t2 = Expect<HasKey<Result, 'id'>>;
    type _t3 = Expect<HasKey<Result, 'email'>>;
    type _t4 = Expect<HasKey<Result, 'name'>>;
  });
});

// ---------------------------------------------------------------------------
// IncludeResolve — resolves relation includes
// ---------------------------------------------------------------------------

describe('IncludeResolve', () => {
  it('adds relation as object for one relation', () => {
    type Result = IncludeResolve<typeof postRelations, { author: true }>;

    type _t1 = Expect<HasKey<Result, 'author'>>;
    // author is a 'one' relation to users -- should be a single object
    type AuthorType = Result['author'];
    type _t2 = Expect<HasKey<AuthorType, 'id'>>;
    type _t3 = Expect<HasKey<AuthorType, 'name'>>;
  });

  it('adds relation as array for many relation', () => {
    type Result = IncludeResolve<typeof postRelations, { comments: true }>;

    type _t1 = Expect<HasKey<Result, 'comments'>>;
    // comments is a 'many' relation -- should be an array
    type CommentsType = Result['comments'];
    type _t2 = Expect<Extends<CommentsType, unknown[]>>;
  });

  it('narrows included relation with select sub-clause', () => {
    type Result = IncludeResolve<typeof postRelations, { author: { select: { name: true } } }>;

    type AuthorType = Result['author'];
    type _t1 = Expect<HasKey<AuthorType, 'name'>>;
    type _t2 = Expect<Not<HasKey<AuthorType, 'id'>>>;
    type _t3 = Expect<Not<HasKey<AuthorType, 'email'>>>;
  });

  it('excludes hidden columns in default include', () => {
    type Result = IncludeResolve<typeof postRelations, { author: true }>;

    type AuthorType = Result['author'];
    // passwordHash is hidden on users -- should not appear
    type _t1 = Expect<Not<HasKey<AuthorType, 'passwordHash'>>>;
  });
});

// ---------------------------------------------------------------------------
// FindResult — combined select + include
// ---------------------------------------------------------------------------

describe('FindResult', () => {
  it('narrows to selected fields', () => {
    type Result = FindResult<typeof posts, { select: { id: true; title: true } }>;

    type _t1 = Expect<HasKey<Result, 'id'>>;
    type _t2 = Expect<HasKey<Result, 'title'>>;
    type _t3 = Expect<Not<HasKey<Result, 'body'>>>;
    type _t4 = Expect<Not<HasKey<Result, 'published'>>>;
  });

  it('adds included relation', () => {
    type Result = FindResult<typeof posts, { include: { author: true } }, typeof postRelations>;

    // Should have post columns (default select excludes hidden)
    type _t1 = Expect<HasKey<Result, 'id'>>;
    type _t2 = Expect<HasKey<Result, 'title'>>;

    // Should have author from include
    type _t3 = Expect<HasKey<Result, 'author'>>;
  });

  it('narrows included relation with select', () => {
    type Result = FindResult<
      typeof posts,
      { include: { author: { select: { name: true } } } },
      typeof postRelations
    >;

    // Author should only have name
    type AuthorType = Result['author'];
    type _t1 = Expect<HasKey<AuthorType, 'name'>>;
    type _t2 = Expect<Not<HasKey<AuthorType, 'id'>>>;
  });

  it('excludes sensitive columns from result with not: sensitive', () => {
    type Result = FindResult<typeof users, { select: { not: 'sensitive' } }>;

    type _t1 = Expect<Not<HasKey<Result, 'email'>>>;
    type _t2 = Expect<Not<HasKey<Result, 'passwordHash'>>>;
    type _t3 = Expect<HasKey<Result, 'id'>>;
    type _t4 = Expect<HasKey<Result, 'name'>>;
  });

  it('returns default columns when no options specified', () => {
    type Result = FindResult<typeof users>;

    // Default behavior: excludes hidden
    type _t1 = Expect<Not<HasKey<Result, 'passwordHash'>>>;
    type _t2 = Expect<HasKey<Result, 'id'>>;
    type _t3 = Expect<HasKey<Result, 'email'>>;
    type _t4 = Expect<HasKey<Result, 'name'>>;
  });
});

// ---------------------------------------------------------------------------
// InsertInput / UpdateInput — standalone type utilities
// ---------------------------------------------------------------------------

describe('InsertInput', () => {
  it('makes defaulted columns optional', () => {
    type UserInsert = InsertInput<typeof users>;

    // Required fields: email, passwordHash, name, bio, age, score
    // Optional fields: id (primary), role (default), active (default), createdAt (default)
    const _valid: UserInsert = {
      email: 'a@b.com',
      passwordHash: 'hash',
      name: 'Alice',
      bio: null,
      age: 25,
      score: 100,
    };
    void _valid;
  });

  it('rejects missing required fields', () => {
    type UserInsert = InsertInput<typeof users>;

    // @ts-expect-error -- name is required, cannot be omitted
    const _bad: UserInsert = {
      email: 'a@b.com',
      passwordHash: 'hash',
      bio: null,
      age: 25,
      score: 100,
    };
    void _bad;
  });
});

describe('UpdateInput', () => {
  it('makes all non-PK columns optional', () => {
    type UserUpdate = UpdateInput<typeof users>;

    const _valid: UserUpdate = {};
    const _partial: UserUpdate = { name: 'New Name' };
    void _valid;
    void _partial;
  });

  it('excludes primary key', () => {
    type UserUpdate = UpdateInput<typeof users>;

    type _t1 = Expect<Not<HasKey<UserUpdate, 'id'>>>;
  });
});

// ---------------------------------------------------------------------------
// Database — registry type
// ---------------------------------------------------------------------------

describe('Database', () => {
  it('carries table registry type information', () => {
    type MyDB = Database<{
      users: ModelEntry<typeof users, typeof postRelations>;
      posts: ModelEntry<typeof posts, typeof commentRelations>;
    }>;

    type Tables = MyDB['_models'];
    type _t1 = Expect<HasKey<Tables, 'users'>>;
    type _t2 = Expect<HasKey<Tables, 'posts'>>;
  });

  it('table entries carry correct types', () => {
    type MyDB = Database<{
      users: ModelEntry<typeof users>;
    }>;

    type UsersEntry = MyDB['_models']['users'];
    type _t1 = Expect<Equal<UsersEntry['table'], typeof users>>;
  });
});

// ---------------------------------------------------------------------------
// IncludeOption — typed select/where/orderBy constrained to target table (#1130)
// ---------------------------------------------------------------------------

describe('IncludeOption constrains fields to target table columns', () => {
  it('accepts valid column names in select', () => {
    type PostInclude = IncludeOption<typeof postRelations>;
    const _inc: PostInclude = {
      author: { select: { id: true, name: true } },
    };
    void _inc;
  });

  it('rejects invalid column names in select', () => {
    type PostInclude = IncludeOption<typeof postRelations>;
    const _inc: PostInclude = {
      // @ts-expect-error — 'nonExistent' is not a column on users table
      author: { select: { nonExistent: true } },
    };
    void _inc;
  });

  it('accepts valid where filter on target table columns', () => {
    type PostInclude = IncludeOption<typeof postRelations>;
    const _inc: PostInclude = {
      author: { where: { name: 'Alice' } },
    };
    void _inc;
  });

  it('rejects invalid column in where', () => {
    type PostInclude = IncludeOption<typeof postRelations>;
    const _inc: PostInclude = {
      // @ts-expect-error — 'nonExistent' is not a column on users table
      author: { where: { nonExistent: 'value' } },
    };
    void _inc;
  });

  it('accepts valid orderBy on target table columns', () => {
    type PostInclude = IncludeOption<typeof postRelations>;
    const _inc: PostInclude = {
      comments: { orderBy: { text: 'asc' } },
    };
    void _inc;
  });

  it('rejects invalid column in orderBy', () => {
    type PostInclude = IncludeOption<typeof postRelations>;
    const _inc: PostInclude = {
      // @ts-expect-error — 'nonExistent' is not a column on comments table
      comments: { orderBy: { nonExistent: 'asc' } },
    };
    void _inc;
  });

  it('accepts limit as number', () => {
    type PostInclude = IncludeOption<typeof postRelations>;
    const _inc: PostInclude = {
      comments: { limit: 10 },
    };
    void _inc;
  });

  it('accepts true for simple include', () => {
    type PostInclude = IncludeOption<typeof postRelations>;
    const _inc: PostInclude = {
      author: true,
      comments: true,
    };
    void _inc;
  });
});

// ---------------------------------------------------------------------------
// Include depth cap
// ---------------------------------------------------------------------------

describe('Include depth cap', () => {
  it('resolves at depth 0 (normal case)', () => {
    type Result = IncludeResolve<typeof postRelations, { author: true }>;
    type _t1 = Expect<HasKey<Result, 'author'>>;
  });

  // Depth cap at 2 means depth tuple of length 3 produces `unknown`.
  // We test this indirectly: the type system won't blow up with infinite recursion.
  it('depth-capped result collapses to unknown at cap', () => {
    // At depth [_, _, _] (length 3), IncludeResolve returns unknown
    type CappedResult = IncludeResolve<
      typeof postRelations,
      { author: true },
      [unknown, unknown, unknown]
    >;

    type _t1 = Expect<Equal<CappedResult, unknown>>;
  });
});
