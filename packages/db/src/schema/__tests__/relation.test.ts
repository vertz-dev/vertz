import { describe, expect, it } from 'bun:test';
import { d } from '../../d';

// ---------------------------------------------------------------------------
// Fixture tables
// ---------------------------------------------------------------------------

const users = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
});

const posts = d.table('posts', {
  id: d.uuid().primary(),
  title: d.text(),
  authorId: d.uuid().references('users'),
});

const _tags = d.table('tags', {
  id: d.uuid().primary(),
  label: d.text(),
});

const postTags = d.table('post_tags', {
  id: d.uuid().primary(),
  postId: d.uuid().references('posts'),
  tagId: d.uuid().references('tags'),
});

// ---------------------------------------------------------------------------
// d.ref.one() -- belongsTo (many-to-one)
// ---------------------------------------------------------------------------

describe('d.ref.one()', () => {
  it('creates a belongsTo relation with correct metadata', () => {
    const rel = d.ref.one(() => users, 'authorId');

    expect(rel._type).toBe('one');
    expect(rel._target()).toBe(users);
    expect(rel._foreignKey).toBe('authorId');
    expect(rel._through).toBeNull();
  });

  it('lazily resolves the target table', () => {
    let resolved = false;
    const rel = d.ref.one(() => {
      resolved = true;
      return users;
    }, 'authorId');

    expect(resolved).toBe(false);
    rel._target();
    expect(resolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// d.ref.many() -- hasMany (one-to-many)
// ---------------------------------------------------------------------------

describe('d.ref.many()', () => {
  it('creates a hasMany relation with correct metadata', () => {
    const rel = d.ref.many(() => posts, 'authorId');

    expect(rel._type).toBe('many');
    expect(rel._target()).toBe(posts);
    expect(rel._foreignKey).toBe('authorId');
    expect(rel._through).toBeNull();
  });

  it('lazily resolves the target table', () => {
    let resolved = false;
    const rel = d.ref.many(() => {
      resolved = true;
      return posts;
    }, 'authorId');

    expect(resolved).toBe(false);
    rel._target();
    expect(resolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// d.ref.many().through() -- manyToMany
// ---------------------------------------------------------------------------

describe('d.ref.many().through()', () => {
  it('creates a manyToMany relation with correct metadata', () => {
    const rel = d.ref.many(() => posts).through(() => postTags, 'tagId', 'postId');

    expect(rel._type).toBe('many');
    expect(rel._target()).toBe(posts);
    expect(rel._foreignKey).toBeNull();
    expect(rel._through).not.toBeNull();
    expect(rel._through?.table()).toBe(postTags);
    expect(rel._through?.thisKey).toBe('tagId');
    expect(rel._through?.thatKey).toBe('postId');
  });

  it('lazily resolves both target and join tables', () => {
    let targetResolved = false;
    let joinResolved = false;

    const rel = d.ref
      .many(() => {
        targetResolved = true;
        return posts;
      })
      .through(
        () => {
          joinResolved = true;
          return postTags;
        },
        'tagId',
        'postId',
      );

    expect(targetResolved).toBe(false);
    expect(joinResolved).toBe(false);

    rel._target();
    expect(targetResolved).toBe(true);

    rel._through?.table();
    expect(joinResolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Relations in table options
// ---------------------------------------------------------------------------

describe('relations in table options', () => {
  it('accepts relation definitions in table options', () => {
    const usersWithRelations = d.table(
      'users',
      {
        id: d.uuid().primary(),
        name: d.text(),
      },
      {
        relations: {
          posts: d.ref.many(() => posts, 'authorId'),
        },
      },
    );

    expect(usersWithRelations._name).toBe('users');
  });
});
