import { describe, expectTypeOf, it } from 'vitest';
import { d } from '../d';

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
const _tables = {
  organizations: { table: organizations, relations: {} },
  users: { table: users, relations: {} },
  posts: { table: posts, relations: postRelations },
  comments: { table: comments, relations: commentRelations },
  featureFlags: { table: featureFlags, relations: {} },
};
// ---------------------------------------------------------------------------
// Cycle 1: get return type
// ---------------------------------------------------------------------------
describe('Cycle 1: get return type', () => {
  it('returns correct field types for organizations (default select)', () => {
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('name');
    expectTypeOf().toHaveProperty('slug');
    expectTypeOf().toHaveProperty('createdAt');
    expectTypeOf().toBeString();
    expectTypeOf().toEqualTypeOf();
  });
  it('excludes hidden fields by default (passwordHash on users)', () => {
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('name');
    expectTypeOf().toHaveProperty('email');
    expectTypeOf().not.toHaveProperty('passwordHash');
  });
  it('DatabaseInstance get method exists and is a function', () => {
    expectTypeOf().toBeFunction();
  });
  it('DatabaseInstance getOrThrow method exists and is a function', () => {
    expectTypeOf().toBeFunction();
  });
});
// ---------------------------------------------------------------------------
// Cycle 2: list return type
// ---------------------------------------------------------------------------
describe('Cycle 2: list return type', () => {
  it('array elements have correct types', () => {
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('title');
    expectTypeOf().toHaveProperty('content');
    expectTypeOf().toHaveProperty('views');
    expectTypeOf().toBeNumber();
  });
  it('listAndCount result structure', () => {
    expectTypeOf().toHaveProperty('data');
    expectTypeOf().toHaveProperty('total');
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toBeNumber();
  });
});
// ---------------------------------------------------------------------------
// Cycle 3: create return type + typed data input
// ---------------------------------------------------------------------------
describe('Cycle 3: create return type + typed data', () => {
  it('InsertInput types require mandatory fields', () => {
    // id, name, slug are required; createdAt is optional (has default)
    const _valid = {
      id: '123',
      name: 'Acme',
      slug: 'acme',
    };
    void _valid;
  });
  it('InsertInput rejects wrong data types', () => {
    const _bad = {
      id: '123',
      name: 'Acme',
      slug: 'acme',
      // @ts-expect-error -- createdAt should be Date, not number
      createdAt: 123,
    };
    void _bad;
  });
  it('InsertInput allows omitting defaulted fields', () => {
    // role, active, createdAt have defaults -- can be omitted
    const _valid = {
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
    const _valid = {};
    const _partial = { views: 150 };
    void _valid;
    void _partial;
  });
  it('UpdateInput excludes primary key', () => {
    expectTypeOf().not.toHaveProperty('id');
  });
  it('featureFlags result has correct fields', () => {
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('name');
    expectTypeOf().toHaveProperty('enabled');
    expectTypeOf().toBeBoolean();
  });
  it('comment result has correct fields', () => {
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('body');
    expectTypeOf().toHaveProperty('postId');
    expectTypeOf().toHaveProperty('authorId');
  });
});
// ---------------------------------------------------------------------------
// Cycle 5: get with select narrowing
// ---------------------------------------------------------------------------
describe('Cycle 5: select narrowing', () => {
  it('narrows result to selected fields only', () => {
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('title');
    expectTypeOf().not.toHaveProperty('content');
    expectTypeOf().not.toHaveProperty('views');
  });
  it('select with not:sensitive excludes sensitive+hidden fields', () => {
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('name');
    expectTypeOf().not.toHaveProperty('email');
    expectTypeOf().not.toHaveProperty('passwordHash');
  });
});
// ---------------------------------------------------------------------------
// Cycle 6: get with include
// ---------------------------------------------------------------------------
describe('Cycle 6: include resolution', () => {
  it('includes one relation as object', () => {
    expectTypeOf().toHaveProperty('author');
    expectTypeOf().toHaveProperty('id');
    expectTypeOf().toHaveProperty('title');
  });
  it('includes many relation as array', () => {
    expectTypeOf().toHaveProperty('comments');
  });
  it('includes relation with select sub-clause', () => {
    expectTypeOf().toHaveProperty('author');
  });
});
// ---------------------------------------------------------------------------
// Cycle 7: where/filter typing
// ---------------------------------------------------------------------------
describe('Cycle 7: where/filter typing', () => {
  it('rejects invalid column in where clause via FilterType', () => {
    // @ts-expect-error -- 'invalidColumn' is not a column on posts
    const _bad = { invalidColumn: 'x' };
    void _bad;
  });
  it('rejects wrong type in where value via FilterType', () => {
    // @ts-expect-error -- views is number, not string
    const _bad = { views: 'not-a-number' };
    void _bad;
  });
  it('accepts valid filter values', () => {
    const _ok = { title: 'Hello', views: { gte: 10 } };
    void _ok;
  });
  it('accepts filter operators', () => {
    const _ok = {
      status: { in: ['draft', 'published'] },
      title: { contains: 'Post' },
    };
    void _ok;
  });
});
// ---------------------------------------------------------------------------
// Cycle 8: DatabaseInstance method signatures
// ---------------------------------------------------------------------------
describe('Cycle 8: DatabaseInstance method signatures', () => {
  it('get method is defined', () => {
    expectTypeOf().toBeFunction();
  });
  it('list method is defined', () => {
    expectTypeOf().toBeFunction();
  });
  it('create method is defined', () => {
    expectTypeOf().toBeFunction();
  });
  it('update method is defined', () => {
    expectTypeOf().toBeFunction();
  });
  it('upsert method is defined', () => {
    expectTypeOf().toBeFunction();
  });
  it('delete method is defined', () => {
    expectTypeOf().toBeFunction();
  });
  it('count returns number', () => {
    expectTypeOf().toBeFunction();
  });
  it('createMany returns count', () => {
    expectTypeOf().toBeFunction();
  });
  it('createManyAndReturn method is defined', () => {
    expectTypeOf().toBeFunction();
  });
});
//# sourceMappingURL=database-types.test-d.js.map
