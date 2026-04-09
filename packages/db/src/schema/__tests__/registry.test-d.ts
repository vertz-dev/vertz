import { describe, it } from '@vertz/test';
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
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- testing that the actual return type is {} (empty relations)
    type _t1 = Expect<Equal<typeof models.users.relations, {}>>;
  });
});
