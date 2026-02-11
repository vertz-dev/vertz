import { describe, expect, it } from 'vitest';
import { d } from '../../d';
import { createRegistry } from '../registry';

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
// d.entry() helper
// ---------------------------------------------------------------------------

describe('d.entry()', () => {
  it('returns { table, relations: {} } when called with table only', () => {
    const entry = d.entry(users);

    expect(entry.table).toBe(users);
    expect(entry.relations).toEqual({});
  });

  it('returns { table, relations } when called with table and relations', () => {
    const postRelations = {
      author: d.ref.one(() => users, 'authorId'),
      comments: d.ref.many(() => comments, 'postId'),
    };

    const entry = d.entry(posts, postRelations);

    expect(entry.table).toBe(posts);
    expect(entry.relations).toBe(postRelations);
    expect(entry.relations.author._type).toBe('one');
    expect(entry.relations.comments._type).toBe('many');
  });
});

// ---------------------------------------------------------------------------
// createRegistry()
// ---------------------------------------------------------------------------

describe('createRegistry()', () => {
  it('wraps tables with relations from the callback', () => {
    const tables = createRegistry({ users, posts, comments }, (ref) => ({
      posts: {
        author: ref.posts.one('users', 'authorId'),
        comments: ref.posts.many('comments', 'postId'),
      },
      comments: {
        post: ref.comments.one('posts', 'postId'),
        author: ref.comments.one('users', 'authorId'),
      },
    }));

    // Every table key should exist in the output
    expect(tables.users).toBeDefined();
    expect(tables.posts).toBeDefined();
    expect(tables.comments).toBeDefined();

    // Each entry should have { table, relations }
    expect(tables.users.table).toBe(users);
    expect(tables.posts.table).toBe(posts);
    expect(tables.comments.table).toBe(comments);

    // Relations should be set correctly
    expect(tables.posts.relations.author._type).toBe('one');
    expect(tables.posts.relations.author._target()).toBe(users);
    expect(tables.posts.relations.author._foreignKey).toBe('authorId');

    expect(tables.posts.relations.comments._type).toBe('many');
    expect(tables.posts.relations.comments._target()).toBe(comments);
    expect(tables.posts.relations.comments._foreignKey).toBe('postId');

    expect(tables.comments.relations.post._type).toBe('one');
    expect(tables.comments.relations.post._target()).toBe(posts);
    expect(tables.comments.relations.post._foreignKey).toBe('postId');

    expect(tables.comments.relations.author._type).toBe('one');
    expect(tables.comments.relations.author._target()).toBe(users);
    expect(tables.comments.relations.author._foreignKey).toBe('authorId');
  });

  it('auto-wraps tables without relations', () => {
    const tables = createRegistry({ users, posts, comments }, (ref) => ({
      posts: {
        author: ref.posts.one('users', 'authorId'),
      },
    }));

    // users and comments were not mentioned in the callback — auto-wrapped
    expect(tables.users.table).toBe(users);
    expect(tables.users.relations).toEqual({});

    expect(tables.comments.table).toBe(comments);
    expect(tables.comments.relations).toEqual({});
  });

  it('handles empty callback (no relations at all)', () => {
    const tables = createRegistry({ users, posts }, () => ({}));

    expect(tables.users.table).toBe(users);
    expect(tables.users.relations).toEqual({});
    expect(tables.posts.table).toBe(posts);
    expect(tables.posts.relations).toEqual({});
  });
});
