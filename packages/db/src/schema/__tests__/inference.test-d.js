import { describe, expectTypeOf, it } from 'vitest';
import { d } from '../../d';

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
const _postRelations = {
  author: d.ref.one(() => users, 'authorId'),
  comments: d.ref.many(() => comments, 'postId'),
};
// Relations for comments
const _commentRelations = {
  post: d.ref.one(() => posts, 'postId'),
  author: d.ref.one(() => users, 'authorId'),
};
// ---------------------------------------------------------------------------
// FilterType — typed where filters
// ---------------------------------------------------------------------------
describe('FilterType', () => {
  it('allows direct value shorthand for filters', () => {
    const _filter = {
      name: 'John',
      active: true,
    };
    void _filter;
  });
  it('allows eq operator matching column type', () => {
    const _filter = {
      name: { eq: 'John' },
      active: { eq: true },
      age: { eq: 30 },
    };
    void _filter;
  });
  it('allows comparison operators for number columns', () => {
    const _filter = {
      age: { gt: 18, lte: 65 },
    };
    void _filter;
  });
  it('allows comparison operators for string columns', () => {
    const _filter = {
      name: { gte: 'A', lt: 'Z' },
    };
    void _filter;
  });
  it('allows in/notIn with array of matching type', () => {
    const _filter = {
      role: { in: ['admin', 'editor'] },
      name: { notIn: ['banned1', 'banned2'] },
    };
    void _filter;
  });
  it('allows string operators on string columns', () => {
    const _filter = {
      name: { contains: 'oh', startsWith: 'J', endsWith: 'n' },
    };
    void _filter;
  });
  it('allows isNull on nullable columns', () => {
    const _filter = {
      bio: { isNull: true },
      age: { isNull: false },
    };
    void _filter;
  });
  it('rejects wrong type in filter value', () => {
    // @ts-expect-error -- name is string, cannot filter with number
    const _bad = { name: 42 };
    void _bad;
  });
  it('rejects wrong type in eq operator', () => {
    // @ts-expect-error -- age is number|null, cannot use string in eq
    const _bad = { age: { eq: 'not-a-number' } };
    void _bad;
  });
  it('rejects wrong type in in operator', () => {
    // @ts-expect-error -- role is enum string type, cannot use numbers in array
    const _bad = { role: { in: [1, 2, 3] } };
    void _bad;
  });
  it('rejects non-existent column in where clause', () => {
    // @ts-expect-error -- 'nonExistent' is not a column on users
    const _bad = { nonExistent: 'value' };
    void _bad;
  });
  it('allows all filter keys to be optional', () => {
    const _empty = {};
    void _empty;
  });
});
// ---------------------------------------------------------------------------
// OrderByType — constrained to column names with 'asc' | 'desc'
// ---------------------------------------------------------------------------
describe('OrderByType', () => {
  it('allows valid column with asc/desc', () => {
    const _orderBy = {
      name: 'asc',
      createdAt: 'desc',
    };
    void _orderBy;
  });
  it('constrains keys to column names only', () => {
    // @ts-expect-error -- 'nonExistent' is not a column
    const _bad = { nonExistent: 'asc' };
    void _bad;
  });
  it('constrains values to asc | desc only', () => {
    // @ts-expect-error -- 'ascending' is not a valid order direction
    const _bad = { name: 'ascending' };
    void _bad;
  });
});
// ---------------------------------------------------------------------------
// SelectOption — mutual exclusivity
// ---------------------------------------------------------------------------
describe('SelectOption', () => {
  it('allows not: sensitive', () => {
    const _select = { not: 'sensitive' };
    void _select;
  });
  it('allows not: hidden', () => {
    const _select = { not: 'hidden' };
    void _select;
  });
  it('allows explicit field selection', () => {
    const _select = { id: true, name: true };
    void _select;
  });
  it('produces a type error when combining not with explicit select', () => {
    // @ts-expect-error -- cannot combine not with explicit field selection
    const _bad = { not: 'sensitive', id: true };
    void _bad;
  });
  it('does not allow unknown column names in explicit select', () => {
    // @ts-expect-error -- 'bogus' is not a column
    const _bad = { bogus: true };
    void _bad;
  });
});
// ---------------------------------------------------------------------------
// SelectNarrow — narrows result to selected fields
// ---------------------------------------------------------------------------
describe('SelectNarrow', () => {
  it('narrows to picked fields when select has explicit keys', () => {
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('name');
    expectTypeOf().not.toHaveProperty('email');
    expectTypeOf().not.toHaveProperty('passwordHash');
    expectTypeOf().not.toHaveProperty('role');
  });
  it('preserves correct types on narrowed fields', () => {
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
  });
  it('excludes sensitive columns when not: sensitive', () => {
    // email is sensitive, passwordHash is hidden -- both excluded
    expectTypeOf().not.toHaveProperty('email');
    expectTypeOf().not.toHaveProperty('passwordHash');
    // Normal columns included
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('name');
    expectTypeOf().toHaveProperty('role');
  });
  it('excludes hidden columns when not: hidden', () => {
    // passwordHash is hidden -- excluded
    expectTypeOf().not.toHaveProperty('passwordHash');
    // email is sensitive but NOT hidden -- included
    expectTypeOf().toHaveProperty('email');
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('name');
  });
  it('defaults to excluding hidden columns (same as $infer)', () => {
    expectTypeOf().not.toHaveProperty('passwordHash');
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('email');
    expectTypeOf().toHaveProperty('name');
  });
});
// ---------------------------------------------------------------------------
// IncludeResolve — resolves relation includes
// ---------------------------------------------------------------------------
describe('IncludeResolve', () => {
  it('adds relation as object for one relation', () => {
    expectTypeOf().toHaveProperty('author');
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('name');
  });
  it('adds relation as array for many relation', () => {
    expectTypeOf().toHaveProperty('comments');
    expectTypeOf().toMatchTypeOf();
  });
  it('narrows included relation with select sub-clause', () => {
    expectTypeOf().toHaveProperty('name');
    expectTypeOf().not.toHaveProperty('id');
    expectTypeOf().not.toHaveProperty('email');
  });
  it('excludes hidden columns in default include', () => {
    // passwordHash is hidden on users -- should not appear
    expectTypeOf().not.toHaveProperty('passwordHash');
  });
});
// ---------------------------------------------------------------------------
// FindResult — combined select + include
// ---------------------------------------------------------------------------
describe('FindResult', () => {
  it('narrows to selected fields', () => {
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('title');
    expectTypeOf().not.toHaveProperty('body');
    expectTypeOf().not.toHaveProperty('published');
  });
  it('adds included relation', () => {
    // Should have post columns (default select excludes hidden)
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('title');
    // Should have author from include
    expectTypeOf().toHaveProperty('author');
  });
  it('narrows included relation with select', () => {
    expectTypeOf().toHaveProperty('name');
    expectTypeOf().not.toHaveProperty('id');
  });
  it('excludes sensitive columns from result with not: sensitive', () => {
    expectTypeOf().not.toHaveProperty('email');
    expectTypeOf().not.toHaveProperty('passwordHash');
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('name');
  });
  it('returns default columns when no options specified', () => {
    // Default behavior: excludes hidden
    expectTypeOf().not.toHaveProperty('passwordHash');
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('email');
    expectTypeOf().toHaveProperty('name');
  });
});
// ---------------------------------------------------------------------------
// InsertInput / UpdateInput — standalone type utilities
// ---------------------------------------------------------------------------
describe('InsertInput', () => {
  it('makes defaulted columns optional', () => {
    // Required fields: email, passwordHash, name, bio, age, score
    // Optional fields: id (primary), role (default), active (default), createdAt (default)
    const _valid = {
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
    // @ts-expect-error -- name is required, cannot be omitted
    const _bad = {
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
    const _valid = {};
    const _partial = { name: 'New Name' };
    void _valid;
    void _partial;
  });
  it('excludes primary key', () => {
    expectTypeOf().not.toHaveProperty('id');
  });
});
// ---------------------------------------------------------------------------
// Database — registry type
// ---------------------------------------------------------------------------
describe('Database', () => {
  it('carries table registry type information', () => {
    expectTypeOf().toHaveProperty('users');
    expectTypeOf().toHaveProperty('posts');
  });
  it('table entries carry correct types', () => {
    expectTypeOf().toEqualTypeOf();
  });
});
// ---------------------------------------------------------------------------
// Include depth cap
// ---------------------------------------------------------------------------
describe('Include depth cap', () => {
  it('resolves at depth 0 (normal case)', () => {
    expectTypeOf().toHaveProperty('author');
  });
  // Depth cap at 2 means depth tuple of length 3 produces `unknown`.
  // We test this indirectly: the type system won't blow up with infinite recursion.
  it('depth-capped result collapses to unknown at cap', () => {
    expectTypeOf().toBeUnknown();
  });
});
//# sourceMappingURL=inference.test-d.js.map
