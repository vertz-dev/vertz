import { describe, expectTypeOf, it } from 'vitest';
import { d } from '../../d';
import type { ModelEntry } from '../inference';
import { createRegistry } from '../registry';
import type { RelationDef } from '../relation';

// ---------------------------------------------------------------------------
// Fixture tables
// ---------------------------------------------------------------------------

const users = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  email: d.email().unique(),
});

const posts = d.table('posts', {
  id: d.uuid().primary(),
  authorId: d.uuid().references('users', 'id'),
  title: d.text(),
  content: d.text(),
});

const comments = d.table('comments', {
  id: d.uuid().primary(),
  postId: d.uuid().references('posts', 'id'),
  authorId: d.uuid().references('users', 'id'),
  body: d.text(),
});

// ---------------------------------------------------------------------------
// d.entry() type tests
// ---------------------------------------------------------------------------

describe('d.entry() types', () => {
  it('returns ModelEntry with empty relations when called with table only', () => {
    const entry = d.entry(users);

    expectTypeOf(entry).toMatchTypeOf<ModelEntry>();
    expectTypeOf(entry.table).toEqualTypeOf<typeof users>();
    // biome-ignore lint/complexity/noBannedTypes: testing that the actual return type is {} (empty relations)
    expectTypeOf(entry.relations).toEqualTypeOf<{}>();
  });

  it('returns ModelEntry with typed relations when called with table and relations', () => {
    const postRelations = {
      author: d.ref.one(() => users, 'authorId'),
      comments: d.ref.many(() => comments, 'postId'),
    };

    const entry = d.entry(posts, postRelations);

    expectTypeOf(entry).toMatchTypeOf<ModelEntry>();
    expectTypeOf(entry.table).toEqualTypeOf<typeof posts>();
    expectTypeOf(entry.relations.author._type).toEqualTypeOf<'one'>();
    expectTypeOf(entry.relations.comments._type).toEqualTypeOf<'many'>();
  });

  it('entry result satisfies Record<string, ModelEntry>', () => {
    const postRelations = {
      author: d.ref.one(() => users, 'authorId'),
    };

    const tables = {
      users: d.entry(users),
      posts: d.entry(posts, postRelations),
    } satisfies Record<string, ModelEntry>;

    expectTypeOf(tables.users).toMatchTypeOf<ModelEntry>();
    expectTypeOf(tables.posts).toMatchTypeOf<ModelEntry>();
  });

  it('rejects non-table first argument', () => {
    // @ts-expect-error -- first argument must be a TableDef
    d.entry('not a table');

    // @ts-expect-error -- first argument must be a TableDef
    d.entry(42);
  });

  it('rejects non-relation-record second argument', () => {
    // @ts-expect-error -- second argument must be a Record<string, RelationDef>
    d.entry(users, 'not relations');

    // @ts-expect-error -- second argument must be a Record<string, RelationDef>
    d.entry(users, { bad: 42 });
  });
});

// ---------------------------------------------------------------------------
// createRegistry() type tests
// ---------------------------------------------------------------------------

describe('createRegistry() types', () => {
  it('ref.TABLE.one() validates target table name against registry keys', () => {
    createRegistry({ users, posts, comments }, (ref) => ({
      posts: {
        // Valid: 'users' is a key in the registry
        author: ref.posts.one('users', 'authorId'),
      },
    }));
  });

  it('ref.TABLE.one() rejects invalid table names', () => {
    createRegistry({ users, posts, comments }, (ref) => ({
      posts: {
        // @ts-expect-error -- 'nonexistent' is not a table key
        author: ref.posts.one('nonexistent', 'authorId'),
      },
    }));
  });

  it('ref.TABLE.one() validates FK column against source table columns', () => {
    createRegistry({ users, posts, comments }, (ref) => ({
      posts: {
        // Valid: 'authorId' is a column of posts (the source table)
        author: ref.posts.one('users', 'authorId'),
      },
    }));
  });

  it('ref.TABLE.one() rejects invalid FK column names', () => {
    createRegistry({ users, posts, comments }, (ref) => ({
      posts: {
        // @ts-expect-error -- 'fakeColumn' is not a column of posts
        author: ref.posts.one('users', 'fakeColumn'),
      },
    }));
  });

  it('ref.TABLE.one() rejects columns from wrong table', () => {
    createRegistry({ users, posts, comments }, (ref) => ({
      comments: {
        // @ts-expect-error -- 'title' is a column of posts, NOT comments
        post: ref.comments.one('posts', 'title'),
      },
    }));
  });

  it('ref.TABLE.many() validates FK column against target table columns', () => {
    createRegistry({ users, posts, comments }, (ref) => ({
      posts: {
        // Valid: 'postId' is a column of comments (the target table)
        comments: ref.posts.many('comments', 'postId'),
      },
    }));
  });

  it('ref.TABLE.many() rejects invalid FK column on target table', () => {
    createRegistry({ users, posts, comments }, (ref) => ({
      posts: {
        // @ts-expect-error -- 'fakeColumn' is not a column of comments
        comments: ref.posts.many('comments', 'fakeColumn'),
      },
    }));
  });

  it('output type matches Record<string, ModelEntry>', () => {
    const tables = createRegistry({ users, posts, comments }, (ref) => ({
      posts: {
        author: ref.posts.one('users', 'authorId'),
        comments: ref.posts.many('comments', 'postId'),
      },
    }));

    expectTypeOf(tables).toMatchTypeOf<Record<string, ModelEntry>>();
  });

  it('preserves specific table and relation types in output', () => {
    const tables = createRegistry({ users, posts, comments }, (ref) => ({
      posts: {
        author: ref.posts.one('users', 'authorId'),
      },
    }));

    // Table types are preserved
    expectTypeOf(tables.users.table).toEqualTypeOf<typeof users>();
    expectTypeOf(tables.posts.table).toEqualTypeOf<typeof posts>();
    expectTypeOf(tables.comments.table).toEqualTypeOf<typeof comments>();

    // Relation types are preserved
    expectTypeOf(tables.posts.relations.author).toMatchTypeOf<RelationDef<typeof users, 'one'>>();
  });

  it('tables without relations get empty relations object', () => {
    const tables = createRegistry({ users, posts }, (ref) => ({
      posts: {
        author: ref.posts.one('users', 'authorId'),
      },
    }));

    // Users has no explicit relations — should have empty object type
    // biome-ignore lint/complexity/noBannedTypes: testing that the actual return type is {} (empty relations)
    expectTypeOf(tables.users.relations).toEqualTypeOf<{}>();
  });
});
