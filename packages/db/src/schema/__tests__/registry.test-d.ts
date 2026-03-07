import { describe, it } from 'bun:test';
import type { Equal, Expect, Extends } from '../../__tests__/_type-helpers';
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
  authorId: d.uuid(),
  title: d.text(),
  content: d.text(),
});

const comments = d.table('comments', {
  id: d.uuid().primary(),
  postId: d.uuid(),
  authorId: d.uuid(),
  body: d.text(),
});

// ---------------------------------------------------------------------------
// d.entry() type tests
// ---------------------------------------------------------------------------

describe('d.entry() types', () => {
  it('returns ModelEntry with empty relations when called with table only', () => {
    const entry = d.entry(users);

    type _t1 = Expect<Extends<typeof entry, ModelEntry>>;
    type _t2 = Expect<Equal<typeof entry.table, typeof users>>;
    // biome-ignore lint/complexity/noBannedTypes: testing that the actual return type is {} (empty relations)
    type _t3 = Expect<Equal<typeof entry.relations, {}>>;
  });

  it('returns ModelEntry with typed relations when called with table and relations', () => {
    const postRelations = {
      author: d.ref.one(() => users, 'authorId'),
      comments: d.ref.many(() => comments, 'postId'),
    };

    const entry = d.entry(posts, postRelations);

    type _t1 = Expect<Extends<typeof entry, ModelEntry>>;
    type _t2 = Expect<Equal<typeof entry.table, typeof posts>>;
    type _t3 = Expect<Equal<typeof entry.relations.author._type, 'one'>>;
    type _t4 = Expect<Equal<typeof entry.relations.comments._type, 'many'>>;
  });

  it('entry result satisfies Record<string, ModelEntry>', () => {
    const postRelations = {
      author: d.ref.one(() => users, 'authorId'),
    };

    const models = {
      users: d.entry(users),
      posts: d.entry(posts, postRelations),
    } satisfies Record<string, ModelEntry>;

    type _t1 = Expect<Extends<typeof models.users, ModelEntry>>;
    type _t2 = Expect<Extends<typeof models.posts, ModelEntry>>;
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
    const models = createRegistry({ users, posts, comments }, (ref) => ({
      posts: {
        author: ref.posts.one('users', 'authorId'),
        comments: ref.posts.many('comments', 'postId'),
      },
    }));

    type _t1 = Expect<Extends<typeof models, Record<string, ModelEntry>>>;
  });

  it('preserves specific table and relation types in output', () => {
    const models = createRegistry({ users, posts, comments }, (ref) => ({
      posts: {
        author: ref.posts.one('users', 'authorId'),
      },
    }));

    // Table types are preserved
    type _t1 = Expect<Equal<typeof models.users.table, typeof users>>;
    type _t2 = Expect<Equal<typeof models.posts.table, typeof posts>>;
    type _t3 = Expect<Equal<typeof models.comments.table, typeof comments>>;

    // Relation types are preserved
    type _t4 = Expect<
      Extends<typeof models.posts.relations.author, RelationDef<typeof users, 'one'>>
    >;
  });

  it('tables without relations get empty relations object', () => {
    const models = createRegistry({ users, posts }, (ref) => ({
      posts: {
        author: ref.posts.one('users', 'authorId'),
      },
    }));

    // Users has no explicit relations — should have empty object type
    // biome-ignore lint/complexity/noBannedTypes: testing that the actual return type is {} (empty relations)
    type _t1 = Expect<Equal<typeof models.users.relations, {}>>;
  });
});
