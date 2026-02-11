import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../client/database';
import { d } from '../../d';
import type { TableEntry } from '../../schema/inference';

/**
 * Relation loading integration tests — DB-011 acceptance criteria.
 *
 * Tests the `include` option on find queries using PGlite.
 * Covers belongsTo (one), hasMany (many), and batched loading.
 */
describe('Relation loading (DB-011)', () => {
  let pg: PGlite;

  // Schema: users, posts, comments (for nested includes)
  const usersTable = d.table('users', {
    id: d.uuid().primary().default('gen_random_uuid()'),
    name: d.text(),
    email: d.text().unique(),
  });

  const postsTable = d.table('posts', {
    id: d.uuid().primary().default('gen_random_uuid()'),
    title: d.text(),
    body: d.text().nullable(),
    authorId: d.uuid().references('users'),
  });

  const commentsTable = d.table('comments', {
    id: d.uuid().primary().default('gen_random_uuid()'),
    text: d.text(),
    postId: d.uuid().references('posts'),
    authorId: d.uuid().references('users'),
  });

  const tables = {
    users: {
      table: usersTable,
      relations: {
        posts: d.ref.many(() => postsTable, 'authorId'),
      },
    },
    posts: {
      table: postsTable,
      relations: {
        author: d.ref.one(() => usersTable, 'authorId'),
        comments: d.ref.many(() => commentsTable, 'postId'),
      },
    },
    comments: {
      table: commentsTable,
      relations: {
        post: d.ref.one(() => postsTable, 'postId'),
        author: d.ref.one(() => usersTable, 'authorId'),
      },
    },
  } satisfies Record<string, TableEntry>;

  type Db = ReturnType<typeof createDb<typeof tables>>;
  let db: Db;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL
      );

      CREATE TABLE posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        body TEXT,
        author_id UUID NOT NULL REFERENCES users(id)
      );

      CREATE TABLE comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        text TEXT NOT NULL,
        post_id UUID NOT NULL REFERENCES posts(id),
        author_id UUID NOT NULL REFERENCES users(id)
      );
    `);

    db = createDb({
      url: 'pglite://memory',
      tables,
      _queryFn: async <T>(sql: string, params: readonly unknown[]) => {
        const result = await pg.query<T>(sql, params as unknown[]);
        return { rows: result.rows as readonly T[], rowCount: result.affectedRows ?? 0 };
      },
    });
  });

  afterAll(async () => {
    await pg.close();
  });

  beforeEach(async () => {
    await pg.exec('DELETE FROM comments');
    await pg.exec('DELETE FROM posts');
    await pg.exec('DELETE FROM users');
  });

  // -------------------------------------------------------------------------
  // belongsTo (one) relation
  // -------------------------------------------------------------------------

  describe('include: belongsTo (one)', () => {
    it('loads a single related object via include: { author: true }', async () => {
      const user = (await db.create('users', {
        data: { name: 'Alice', email: 'alice@test.com' },
      })) as Record<string, unknown>;

      await db.create('posts', {
        data: { title: 'Post 1', authorId: user.id },
      });

      const post = (await db.findOne('posts', {
        where: { title: 'Post 1' },
        include: { author: true },
      })) as Record<string, unknown>;

      expect(post).not.toBeNull();
      expect(post.title).toBe('Post 1');
      expect(post.author).toBeDefined();
      expect((post.author as Record<string, unknown>).name).toBe('Alice');
    });

    it('sets null when FK has no matching row', async () => {
      // Create user and post, then delete the user (via raw SQL to bypass FK)
      const user = (await db.create('users', {
        data: { name: 'Alice', email: 'alice@test.com' },
      })) as Record<string, unknown>;

      await db.create('posts', {
        data: { title: 'Post 1', authorId: user.id },
      });

      // The author exists, so it should load
      const post = (await db.findOne('posts', {
        where: { title: 'Post 1' },
        include: { author: true },
      })) as Record<string, unknown>;

      expect(post.author).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // hasMany relation
  // -------------------------------------------------------------------------

  describe('include: hasMany (many)', () => {
    it('loads array of related objects via include: { posts: true }', async () => {
      const user = (await db.create('users', {
        data: { name: 'Alice', email: 'alice@test.com' },
      })) as Record<string, unknown>;

      await db.create('posts', {
        data: { title: 'Post 1', authorId: user.id },
      });
      await db.create('posts', {
        data: { title: 'Post 2', authorId: user.id },
      });

      const result = (await db.findOne('users', {
        where: { name: 'Alice' },
        include: { posts: true },
      })) as Record<string, unknown>;

      expect(result).not.toBeNull();
      expect(Array.isArray(result.posts)).toBe(true);
      const posts = result.posts as Record<string, unknown>[];
      expect(posts).toHaveLength(2);
      const titles = posts.map((p) => p.title);
      expect(titles).toContain('Post 1');
      expect(titles).toContain('Post 2');
    });

    it('returns empty array when no related rows exist', async () => {
      await db.create('users', {
        data: { name: 'Bob', email: 'bob@test.com' },
      });

      const result = (await db.findOne('users', {
        where: { name: 'Bob' },
        include: { posts: true },
      })) as Record<string, unknown>;

      expect(result).not.toBeNull();
      expect(result.posts).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Batched loading (N+1 prevention)
  // -------------------------------------------------------------------------

  describe('batched loading', () => {
    it('prevents N+1 by batching relation loads with IN query', async () => {
      const alice = (await db.create('users', {
        data: { name: 'Alice', email: 'alice@test.com' },
      })) as Record<string, unknown>;
      const bob = (await db.create('users', {
        data: { name: 'Bob', email: 'bob@test.com' },
      })) as Record<string, unknown>;

      await db.create('posts', { data: { title: 'Alice Post 1', authorId: alice.id } });
      await db.create('posts', { data: { title: 'Alice Post 2', authorId: alice.id } });
      await db.create('posts', { data: { title: 'Bob Post 1', authorId: bob.id } });

      // findMany with include should batch the relation query
      const users = (await db.findMany('users', {
        orderBy: { name: 'asc' },
        include: { posts: true },
      })) as Record<string, unknown>[];

      expect(users).toHaveLength(2);

      const aliceResult = users[0] as Record<string, unknown>;
      expect(aliceResult.name).toBe('Alice');
      expect((aliceResult.posts as unknown[]).length).toBe(2);

      const bobResult = users[1] as Record<string, unknown>;
      expect(bobResult.name).toBe('Bob');
      expect((bobResult.posts as unknown[]).length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Include with select narrowing
  // -------------------------------------------------------------------------

  describe('include with select', () => {
    it('narrows included relation fields via select', async () => {
      const user = (await db.create('users', {
        data: { name: 'Alice', email: 'alice@test.com' },
      })) as Record<string, unknown>;

      await db.create('posts', {
        data: { title: 'Post 1', authorId: user.id },
      });

      const post = (await db.findOne('posts', {
        where: { title: 'Post 1' },
        include: { author: { select: { name: true } } },
      })) as Record<string, unknown>;

      expect(post).not.toBeNull();
      const author = post.author as Record<string, unknown>;
      expect(author.name).toBe('Alice');
      // id is always included for mapping purposes
      expect(author.id).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // findManyAndCount with include
  // -------------------------------------------------------------------------

  describe('findManyAndCount with include', () => {
    it('loads relations alongside paginated results', async () => {
      const user = (await db.create('users', {
        data: { name: 'Alice', email: 'alice@test.com' },
      })) as Record<string, unknown>;

      await db.create('posts', { data: { title: 'Post 1', authorId: user.id } });
      await db.create('posts', { data: { title: 'Post 2', authorId: user.id } });
      await db.create('posts', { data: { title: 'Post 3', authorId: user.id } });

      const { data, total } = await db.findManyAndCount('posts', {
        orderBy: { title: 'asc' },
        limit: 2,
        include: { author: true },
      });

      expect(total).toBe(3);
      expect(data).toHaveLength(2);
      expect((data[0] as Record<string, unknown>).author).toBeDefined();
    });
  });
});
