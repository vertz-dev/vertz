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
    const models = createRegistry({ users, posts, comments }, (ref) => ({
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
    expect(models.users).toBeDefined();
    expect(models.posts).toBeDefined();
    expect(models.comments).toBeDefined();

    // Each entry should have { table, relations }
    expect(models.users.table).toBe(users);
    expect(models.posts.table).toBe(posts);
    expect(models.comments.table).toBe(comments);

    // Relations should be set correctly
    expect(models.posts.relations.author._type).toBe('one');
    expect(models.posts.relations.author._target()).toBe(users);
    expect(models.posts.relations.author._foreignKey).toBe('authorId');

    expect(models.posts.relations.comments._type).toBe('many');
    expect(models.posts.relations.comments._target()).toBe(comments);
    expect(models.posts.relations.comments._foreignKey).toBe('postId');

    expect(models.comments.relations.post._type).toBe('one');
    expect(models.comments.relations.post._target()).toBe(posts);
    expect(models.comments.relations.post._foreignKey).toBe('postId');

    expect(models.comments.relations.author._type).toBe('one');
    expect(models.comments.relations.author._target()).toBe(users);
    expect(models.comments.relations.author._foreignKey).toBe('authorId');
  });

  it('auto-wraps tables without relations', () => {
    const models = createRegistry({ users, posts, comments }, (ref) => ({
      posts: {
        author: ref.posts.one('users', 'authorId'),
      },
    }));

    // users and comments were not mentioned in the callback — auto-wrapped
    expect(models.users.table).toBe(users);
    expect(models.users.relations).toEqual({});

    expect(models.comments.table).toBe(comments);
    expect(models.comments.relations).toEqual({});
  });

  it('handles empty callback (no relations at all)', () => {
    const models = createRegistry({ users, posts }, () => ({}));

    expect(models.users.table).toBe(users);
    expect(models.users.relations).toEqual({});
    expect(models.posts.table).toBe(posts);
    expect(models.posts.relations).toEqual({});
  });
});
