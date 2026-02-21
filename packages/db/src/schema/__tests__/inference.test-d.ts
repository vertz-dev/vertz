import { describe, expectTypeOf, it } from 'vitest';
import { d } from '../../d';
import type {
  Database,
  FilterType,
  FindResult,
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
  email: d.email().unique().sensitive(),
  passwordHash: d.text().hidden(),
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
  authorId: d.uuid().references('users'),
  createdAt: d.timestamp().default('now'),
});

const comments = d.table('comments', {
  id: d.uuid().primary(),
  text: d.text(),
  postId: d.uuid().references('posts'),
  authorId: d.uuid().references('users'),
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

    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('name');
    expectTypeOf<Result>().not.toHaveProperty('email');
    expectTypeOf<Result>().not.toHaveProperty('passwordHash');
    expectTypeOf<Result>().not.toHaveProperty('role');
  });

  it('preserves correct types on narrowed fields', () => {
    type Result = SelectNarrow<typeof users._columns, { id: true; bio: true; active: true }>;

    expectTypeOf<Result['id']>().toEqualTypeOf<string>();
    expectTypeOf<Result['bio']>().toEqualTypeOf<string | null>();
    expectTypeOf<Result['active']>().toEqualTypeOf<boolean>();
  });

  it('excludes sensitive columns when not: sensitive', () => {
    type Result = SelectNarrow<typeof users._columns, { not: 'sensitive' }>;

    // email is sensitive, passwordHash is hidden -- both excluded
    expectTypeOf<Result>().not.toHaveProperty('email');
    expectTypeOf<Result>().not.toHaveProperty('passwordHash');

    // Normal columns included
    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('name');
    expectTypeOf<Result>().toHaveProperty('role');
  });

  it('excludes hidden columns when not: hidden', () => {
    type Result = SelectNarrow<typeof users._columns, { not: 'hidden' }>;

    // passwordHash is hidden -- excluded
    expectTypeOf<Result>().not.toHaveProperty('passwordHash');

    // email is sensitive but NOT hidden -- included
    expectTypeOf<Result>().toHaveProperty('email');
    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('name');
  });

  it('defaults to excluding hidden columns (same as $infer)', () => {
    type Result = SelectNarrow<typeof users._columns, undefined>;

    expectTypeOf<Result>().not.toHaveProperty('passwordHash');
    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('email');
    expectTypeOf<Result>().toHaveProperty('name');
  });
});

// ---------------------------------------------------------------------------
// IncludeResolve — resolves relation includes
// ---------------------------------------------------------------------------

describe('IncludeResolve', () => {
  it('adds relation as object for one relation', () => {
    type Result = IncludeResolve<typeof postRelations, { author: true }>;

    expectTypeOf<Result>().toHaveProperty('author');
    // author is a 'one' relation to users -- should be a single object
    type AuthorType = Result['author'];
    expectTypeOf<AuthorType>().toHaveProperty('id');
    expectTypeOf<AuthorType>().toHaveProperty('name');
  });

  it('adds relation as array for many relation', () => {
    type Result = IncludeResolve<typeof postRelations, { comments: true }>;

    expectTypeOf<Result>().toHaveProperty('comments');
    // comments is a 'many' relation -- should be an array
    type CommentsType = Result['comments'];
    expectTypeOf<CommentsType>().toMatchTypeOf<unknown[]>();
  });

  it('narrows included relation with select sub-clause', () => {
    type Result = IncludeResolve<typeof postRelations, { author: { select: { name: true } } }>;

    type AuthorType = Result['author'];
    expectTypeOf<AuthorType>().toHaveProperty('name');
    expectTypeOf<AuthorType>().not.toHaveProperty('id');
    expectTypeOf<AuthorType>().not.toHaveProperty('email');
  });

  it('excludes hidden columns in default include', () => {
    type Result = IncludeResolve<typeof postRelations, { author: true }>;

    type AuthorType = Result['author'];
    // passwordHash is hidden on users -- should not appear
    expectTypeOf<AuthorType>().not.toHaveProperty('passwordHash');
  });
});

// ---------------------------------------------------------------------------
// FindResult — combined select + include
// ---------------------------------------------------------------------------

describe('FindResult', () => {
  it('narrows to selected fields', () => {
    type Result = FindResult<typeof posts, { select: { id: true; title: true } }>;

    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('title');
    expectTypeOf<Result>().not.toHaveProperty('body');
    expectTypeOf<Result>().not.toHaveProperty('published');
  });

  it('adds included relation', () => {
    type Result = FindResult<typeof posts, { include: { author: true } }, typeof postRelations>;

    // Should have post columns (default select excludes hidden)
    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('title');

    // Should have author from include
    expectTypeOf<Result>().toHaveProperty('author');
  });

  it('narrows included relation with select', () => {
    type Result = FindResult<
      typeof posts,
      { include: { author: { select: { name: true } } } },
      typeof postRelations
    >;

    // Author should only have name
    type AuthorType = Result['author'];
    expectTypeOf<AuthorType>().toHaveProperty('name');
    expectTypeOf<AuthorType>().not.toHaveProperty('id');
  });

  it('excludes sensitive columns from result with not: sensitive', () => {
    type Result = FindResult<typeof users, { select: { not: 'sensitive' } }>;

    expectTypeOf<Result>().not.toHaveProperty('email');
    expectTypeOf<Result>().not.toHaveProperty('passwordHash');
    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('name');
  });

  it('returns default columns when no options specified', () => {
    type Result = FindResult<typeof users>;

    // Default behavior: excludes hidden
    expectTypeOf<Result>().not.toHaveProperty('passwordHash');
    expectTypeOf<Result>().toHaveProperty('id');
    expectTypeOf<Result>().toHaveProperty('email');
    expectTypeOf<Result>().toHaveProperty('name');
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

    expectTypeOf<UserUpdate>().not.toHaveProperty('id');
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
    expectTypeOf<Tables>().toHaveProperty('users');
    expectTypeOf<Tables>().toHaveProperty('posts');
  });

  it('table entries carry correct types', () => {
    type MyDB = Database<{
      users: ModelEntry<typeof users>;
    }>;

    type UsersEntry = MyDB['_models']['users'];
    expectTypeOf<UsersEntry['table']>().toEqualTypeOf<typeof users>();
  });
});

// ---------------------------------------------------------------------------
// Include depth cap
// ---------------------------------------------------------------------------

describe('Include depth cap', () => {
  it('resolves at depth 0 (normal case)', () => {
    type Result = IncludeResolve<typeof postRelations, { author: true }>;
    expectTypeOf<Result>().toHaveProperty('author');
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

    expectTypeOf<CappedResult>().toBeUnknown();
  });
});
