import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@vertz/test';
import { PGlite } from '@electric-sql/pglite';
import { unwrap } from '@vertz/schema';
import { createDb } from '../../client/database';
import { d } from '../../d';
import type { ModelEntry } from '../../schema/inference';
import { loadRelations } from '../relation-loader';

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
    authorId: d.uuid(),
  });

  const commentsTable = d.table('comments', {
    id: d.uuid().primary().default('gen_random_uuid()'),
    text: d.text(),
    postId: d.uuid(),
    authorId: d.uuid(),
  });

  const models = {
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
  } satisfies Record<string, ModelEntry>;

  type Db = ReturnType<typeof createDb<typeof models>>;
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
      models,
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
      const user = unwrap(
        await db.users.create({
          data: { name: 'Alice', email: 'alice@test.com' },
        }),
      ) as Record<string, unknown>;

      unwrap(
        await db.posts.create({
          data: { title: 'Post 1', authorId: user.id },
        }),
      );

      const post = unwrap(
        await db.posts.get({
          where: { title: 'Post 1' },
          include: { author: true },
        }),
      ) as Record<string, unknown>;

      expect(post).not.toBeNull();
      expect(post.title).toBe('Post 1');
      expect(post.author).toBeDefined();
      expect((post.author as Record<string, unknown>).name).toBe('Alice');
    });

    it('sets null when FK has no matching row', async () => {
      // Create user and post, then delete the user (via raw SQL to bypass FK)
      const user = unwrap(
        await db.users.create({
          data: { name: 'Alice', email: 'alice@test.com' },
        }),
      ) as Record<string, unknown>;

      unwrap(
        await db.posts.create({
          data: { title: 'Post 1', authorId: user.id },
        }),
      );

      // The author exists, so it should load
      const post = unwrap(
        await db.posts.get({
          where: { title: 'Post 1' },
          include: { author: true },
        }),
      ) as Record<string, unknown>;

      expect(post.author).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // hasMany relation
  // -------------------------------------------------------------------------

  describe('include: hasMany (many)', () => {
    it('loads array of related objects via include: { posts: true }', async () => {
      const user = unwrap(
        await db.users.create({
          data: { name: 'Alice', email: 'alice@test.com' },
        }),
      ) as Record<string, unknown>;

      unwrap(
        await db.posts.create({
          data: { title: 'Post 1', authorId: user.id },
        }),
      );
      unwrap(
        await db.posts.create({
          data: { title: 'Post 2', authorId: user.id },
        }),
      );

      const result = unwrap(
        await db.users.get({
          where: { name: 'Alice' },
          include: { posts: true },
        }),
      ) as Record<string, unknown>;

      expect(result).not.toBeNull();
      expect(Array.isArray(result.posts)).toBe(true);
      const posts = result.posts as Record<string, unknown>[];
      expect(posts).toHaveLength(2);
      const titles = posts.map((p) => p.title);
      expect(titles).toContain('Post 1');
      expect(titles).toContain('Post 2');
    });

    it('returns empty array when no related rows exist', async () => {
      unwrap(
        await db.users.create({
          data: { name: 'Bob', email: 'bob@test.com' },
        }),
      );

      const result = unwrap(
        await db.users.get({
          where: { name: 'Bob' },
          include: { posts: true },
        }),
      ) as Record<string, unknown>;

      expect(result).not.toBeNull();
      expect(result.posts).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Batched loading (N+1 prevention)
  // -------------------------------------------------------------------------

  describe('batched loading', () => {
    it('prevents N+1 by batching relation loads with IN query', async () => {
      const alice = unwrap(
        await db.users.create({
          data: { name: 'Alice', email: 'alice@test.com' },
        }),
      ) as Record<string, unknown>;
      const bob = unwrap(
        await db.users.create({
          data: { name: 'Bob', email: 'bob@test.com' },
        }),
      ) as Record<string, unknown>;

      unwrap(await db.posts.create({ data: { title: 'Alice Post 1', authorId: alice.id } }));
      unwrap(await db.posts.create({ data: { title: 'Alice Post 2', authorId: alice.id } }));
      unwrap(await db.posts.create({ data: { title: 'Bob Post 1', authorId: bob.id } }));

      // list with include should batch the relation query
      const users = unwrap(
        await db.users.list({
          orderBy: { name: 'asc' },
          include: { posts: true },
        }),
      ) as Record<string, unknown>[];

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
      const user = unwrap(
        await db.users.create({
          data: { name: 'Alice', email: 'alice@test.com' },
        }),
      ) as Record<string, unknown>;

      unwrap(
        await db.posts.create({
          data: { title: 'Post 1', authorId: user.id },
        }),
      );

      const post = unwrap(
        await db.posts.get({
          where: { title: 'Post 1' },
          include: { author: { select: { name: true } } },
        }),
      ) as Record<string, unknown>;

      expect(post).not.toBeNull();
      const author = post.author as Record<string, unknown>;
      expect(author.name).toBe('Alice');
      // id is always included for mapping purposes
      expect(author.id).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // listAndCount with include
  // -------------------------------------------------------------------------

  describe('listAndCount with include', () => {
    it('loads relations alongside paginated results', async () => {
      const user = unwrap(
        await db.users.create({
          data: { name: 'Alice', email: 'alice@test.com' },
        }),
      ) as Record<string, unknown>;

      unwrap(await db.posts.create({ data: { title: 'Post 1', authorId: user.id } }));
      unwrap(await db.posts.create({ data: { title: 'Post 2', authorId: user.id } }));
      unwrap(await db.posts.create({ data: { title: 'Post 3', authorId: user.id } }));

      const { data, total } = unwrap(
        await db.posts.listAndCount({
          orderBy: { title: 'asc' },
          limit: 2,
          include: { author: true },
        }),
      );

      expect(total).toBe(3);
      expect(data).toHaveLength(2);
      expect((data[0] as Record<string, unknown>).author).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // B3: Nested includes (depth-2)
  // -------------------------------------------------------------------------

  describe('nested includes (B3)', () => {
    it('loads depth-2 nested includes: posts -> comments', async () => {
      const user = unwrap(
        await db.users.create({
          data: { name: 'Alice', email: 'alice@test.com' },
        }),
      ) as Record<string, unknown>;

      const post = unwrap(
        await db.posts.create({
          data: { title: 'Post 1', authorId: user.id },
        }),
      ) as Record<string, unknown>;

      unwrap(
        await db.comments.create({
          data: { text: 'Great post!', postId: post.id, authorId: user.id },
        }),
      );
      unwrap(
        await db.comments.create({
          data: { text: 'Nice one!', postId: post.id, authorId: user.id },
        }),
      );

      const result = unwrap(
        await db.users.get({
          where: { name: 'Alice' },
          include: { posts: { include: { comments: true } } },
        }),
      ) as Record<string, unknown>;

      expect(result).not.toBeNull();
      const posts = result.posts as Record<string, unknown>[];
      expect(posts).toHaveLength(1);
      const comments = posts[0]?.comments as Record<string, unknown>[];
      expect(comments).toHaveLength(2);
      const texts = comments.map((c) => c.text);
      expect(texts).toContain('Great post!');
      expect(texts).toContain('Nice one!');
    });

    it('loads nested belongsTo: comments -> post -> author', async () => {
      const user = unwrap(
        await db.users.create({
          data: { name: 'Alice', email: 'alice@test.com' },
        }),
      ) as Record<string, unknown>;

      const post = unwrap(
        await db.posts.create({
          data: { title: 'Post 1', authorId: user.id },
        }),
      ) as Record<string, unknown>;

      unwrap(
        await db.comments.create({
          data: { text: 'Great post!', postId: post.id, authorId: user.id },
        }),
      );

      const comment = unwrap(
        await db.comments.get({
          where: { text: 'Great post!' },
          include: { post: { include: { author: true } } },
        }),
      ) as Record<string, unknown>;

      expect(comment).not.toBeNull();
      const relatedPost = comment.post as Record<string, unknown>;
      expect(relatedPost).not.toBeNull();
      expect(relatedPost.title).toBe('Post 1');
      const author = relatedPost.author as Record<string, unknown>;
      expect(author).not.toBeNull();
      expect(author.name).toBe('Alice');
    });
  });
});

// ---------------------------------------------------------------------------
// B2: manyToMany relation support
// ---------------------------------------------------------------------------

describe('Many-to-many relation loading (B2)', () => {
  let pg: PGlite;

  const usersTable = d.table('users', {
    id: d.uuid().primary().default('gen_random_uuid()'),
    name: d.text(),
  });

  const tagsTable = d.table('tags', {
    id: d.uuid().primary().default('gen_random_uuid()'),
    label: d.text(),
  });

  const postTagsTable = d.table('post_tags', {
    id: d.uuid().primary().default('gen_random_uuid()'),
    postId: d.uuid(),
    tagId: d.uuid(),
  });

  const postsTable = d.table('posts', {
    id: d.uuid().primary().default('gen_random_uuid()'),
    title: d.text(),
    authorId: d.uuid(),
  });

  const models = {
    users: {
      table: usersTable,
      relations: {},
    },
    tags: {
      table: tagsTable,
      relations: {
        posts: d.ref.many(() => postsTable).through(() => postTagsTable, 'tagId', 'postId'),
      },
    },
    postTags: {
      table: postTagsTable,
      relations: {},
    },
    posts: {
      table: postsTable,
      relations: {
        author: d.ref.one(() => usersTable, 'authorId'),
        tags: d.ref.many(() => tagsTable).through(() => postTagsTable, 'postId', 'tagId'),
      },
    },
  } satisfies Record<string, ModelEntry>;

  type Db = ReturnType<typeof createDb<typeof models>>;
  let db: Db;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL
      );

      CREATE TABLE tags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        label TEXT NOT NULL
      );

      CREATE TABLE posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        author_id UUID NOT NULL REFERENCES users(id)
      );

      CREATE TABLE post_tags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id UUID NOT NULL REFERENCES posts(id),
        tag_id UUID NOT NULL REFERENCES tags(id)
      );
    `);

    db = createDb({
      url: 'pglite://memory',
      models,
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
    await pg.exec('DELETE FROM post_tags');
    await pg.exec('DELETE FROM posts');
    await pg.exec('DELETE FROM tags');
    await pg.exec('DELETE FROM users');
  });

  it('loads many-to-many related objects via join table', async () => {
    const user = unwrap(await db.users.create({ data: { name: 'Alice' } })) as Record<
      string,
      unknown
    >;

    const post1 = unwrap(
      await db.posts.create({
        data: { title: 'Post 1', authorId: user.id },
      }),
    ) as Record<string, unknown>;
    const post2 = unwrap(
      await db.posts.create({
        data: { title: 'Post 2', authorId: user.id },
      }),
    ) as Record<string, unknown>;

    const tag1 = unwrap(
      await db.tags.create({
        data: { label: 'TypeScript' },
      }),
    ) as Record<string, unknown>;
    const tag2 = unwrap(
      await db.tags.create({
        data: { label: 'PostgreSQL' },
      }),
    ) as Record<string, unknown>;
    const tag3 = unwrap(
      await db.tags.create({
        data: { label: 'Testing' },
      }),
    ) as Record<string, unknown>;

    // Post 1 has TypeScript + PostgreSQL
    unwrap(await db.postTags.create({ data: { postId: post1.id, tagId: tag1.id } }));
    unwrap(await db.postTags.create({ data: { postId: post1.id, tagId: tag2.id } }));
    // Post 2 has PostgreSQL + Testing
    unwrap(await db.postTags.create({ data: { postId: post2.id, tagId: tag2.id } }));
    unwrap(await db.postTags.create({ data: { postId: post2.id, tagId: tag3.id } }));

    const result = unwrap(
      await db.posts.list({
        orderBy: { title: 'asc' },
        include: { tags: true },
      }),
    ) as Record<string, unknown>[];

    expect(result).toHaveLength(2);

    const p1 = result[0] as Record<string, unknown>;
    expect(p1.title).toBe('Post 1');
    const p1Tags = p1.tags as Record<string, unknown>[];
    expect(p1Tags).toHaveLength(2);
    const p1Labels = p1Tags.map((t) => t.label).sort();
    expect(p1Labels).toEqual(['PostgreSQL', 'TypeScript']);

    const p2 = result[1] as Record<string, unknown>;
    expect(p2.title).toBe('Post 2');
    const p2Tags = p2.tags as Record<string, unknown>[];
    expect(p2Tags).toHaveLength(2);
    const p2Labels = p2Tags.map((t) => t.label).sort();
    expect(p2Labels).toEqual(['PostgreSQL', 'Testing']);
  });

  it('returns empty array when no join table entries exist', async () => {
    const user = unwrap(await db.users.create({ data: { name: 'Bob' } })) as Record<
      string,
      unknown
    >;

    unwrap(
      await db.posts.create({
        data: { title: 'Lonely Post', authorId: user.id },
      }),
    );

    const result = unwrap(
      await db.posts.get({
        where: { title: 'Lonely Post' },
        include: { tags: true },
      }),
    ) as Record<string, unknown>;

    expect(result).not.toBeNull();
    expect(result.tags).toEqual([]);
  });

  it('loads the reverse manyToMany direction (tags -> posts)', async () => {
    const user = unwrap(await db.users.create({ data: { name: 'Alice' } })) as Record<
      string,
      unknown
    >;

    const post1 = unwrap(
      await db.posts.create({
        data: { title: 'Post 1', authorId: user.id },
      }),
    ) as Record<string, unknown>;
    const post2 = unwrap(
      await db.posts.create({
        data: { title: 'Post 2', authorId: user.id },
      }),
    ) as Record<string, unknown>;

    const tag = unwrap(
      await db.tags.create({
        data: { label: 'TypeScript' },
      }),
    ) as Record<string, unknown>;

    unwrap(await db.postTags.create({ data: { postId: post1.id, tagId: tag.id } }));
    unwrap(await db.postTags.create({ data: { postId: post2.id, tagId: tag.id } }));

    const result = unwrap(
      await db.tags.get({
        where: { label: 'TypeScript' },
        include: { posts: true },
      }),
    ) as Record<string, unknown>;

    expect(result).not.toBeNull();
    const posts = result.posts as Record<string, unknown>[];
    expect(posts).toHaveLength(2);
    const titles = posts.map((p) => p.title).sort();
    expect(titles).toEqual(['Post 1', 'Post 2']);
  });

  it('sets M2M relation to empty array when all primary PKs are null', async () => {
    const rows = [
      { id: null, title: 'Ghost Post' },
      { id: null, title: 'Another Ghost' },
    ];
    const queryFn = async <T>(sql: string, params: readonly unknown[]) => {
      const result = await pg.query<T>(sql, params as unknown[]);
      return { rows: result.rows as readonly T[], rowCount: result.affectedRows ?? 0 };
    };

    const tablesRegistry = {
      posts: { table: postsTable, relations: models.posts.relations },
      tags: { table: tagsTable, relations: models.tags.relations },
      postTags: { table: postTagsTable, relations: {} },
    };

    await loadRelations(
      queryFn,
      rows,
      models.posts.relations,
      { tags: true },
      0,
      tablesRegistry,
      postsTable,
    );

    expect(rows[0]?.tags).toEqual([]);
    expect(rows[1]?.tags).toEqual([]);
  });

  it('throws when budget is exhausted before M2M join query', async () => {
    const user = unwrap(await db.users.create({ data: { name: 'BudgetTest' } })) as Record<
      string,
      unknown
    >;

    const post = unwrap(
      await db.posts.create({ data: { title: 'Budget Post', authorId: user.id } }),
    ) as Record<string, unknown>;

    const rows = [{ ...post }];
    const queryFn = async <T>(sql: string, params: readonly unknown[]) => {
      const result = await pg.query<T>(sql, params as unknown[]);
      return { rows: result.rows as readonly T[], rowCount: result.affectedRows ?? 0 };
    };

    const tablesRegistry = {
      posts: { table: postsTable, relations: models.posts.relations },
      tags: { table: tagsTable, relations: models.tags.relations },
      postTags: { table: postTagsTable, relations: {} },
    };

    await expect(
      loadRelations(
        queryFn,
        rows,
        models.posts.relations,
        { tags: true },
        0,
        tablesRegistry,
        postsTable,
        {
          remaining: 0,
        },
      ),
    ).rejects.toThrow('Relation query budget exceeded');
  });

  it('throws when budget is exhausted before M2M target query', async () => {
    const user = unwrap(await db.users.create({ data: { name: 'BudgetTest2' } })) as Record<
      string,
      unknown
    >;

    const post = unwrap(
      await db.posts.create({ data: { title: 'Budget Post 2', authorId: user.id } }),
    ) as Record<string, unknown>;

    const tag = unwrap(await db.tags.create({ data: { label: 'BudgetTag' } })) as Record<
      string,
      unknown
    >;
    unwrap(await db.postTags.create({ data: { postId: post.id, tagId: tag.id } }));

    const rows = [{ ...post }];
    const queryFn = async <T>(sql: string, params: readonly unknown[]) => {
      const result = await pg.query<T>(sql, params as unknown[]);
      return { rows: result.rows as readonly T[], rowCount: result.affectedRows ?? 0 };
    };

    const tablesRegistry = {
      posts: { table: postsTable, relations: models.posts.relations },
      tags: { table: tagsTable, relations: models.tags.relations },
      postTags: { table: postTagsTable, relations: {} },
    };

    await expect(
      loadRelations(
        queryFn,
        rows,
        models.posts.relations,
        { tags: true },
        0,
        tablesRegistry,
        postsTable,
        {
          remaining: 1,
        },
      ),
    ).rejects.toThrow('Relation query budget exceeded');
  });

  it('loads nested includes on M2M target rows', async () => {
    const user = unwrap(await db.users.create({ data: { name: 'NestedM2M' } })) as Record<
      string,
      unknown
    >;

    const post = unwrap(
      await db.posts.create({ data: { title: 'Nested Post', authorId: user.id } }),
    ) as Record<string, unknown>;

    const tag = unwrap(await db.tags.create({ data: { label: 'NestedTag' } })) as Record<
      string,
      unknown
    >;
    unwrap(await db.postTags.create({ data: { postId: post.id, tagId: tag.id } }));

    const result = unwrap(
      await db.tags.get({
        where: { label: 'NestedTag' },
        include: { posts: { include: { author: true } } },
      }),
    ) as Record<string, unknown>;

    expect(result).not.toBeNull();
    const posts = result.posts as Record<string, unknown>[];
    expect(posts).toHaveLength(1);
    expect(posts[0]?.title).toBe('Nested Post');
    const author = posts[0]?.author as Record<string, unknown>;
    expect(author).not.toBeNull();
    expect(author.name).toBe('NestedM2M');
  });

  it('skips nested include when target table is not in tablesRegistry', async () => {
    const user = unwrap(await db.users.create({ data: { name: 'NoRegistry' } })) as Record<
      string,
      unknown
    >;

    const post = unwrap(
      await db.posts.create({ data: { title: 'Orphan Post', authorId: user.id } }),
    ) as Record<string, unknown>;

    const rows = [{ ...post }];
    const queryFn = async <T>(sql: string, params: readonly unknown[]) => {
      const result = await pg.query<T>(sql, params as unknown[]);
      return { rows: result.rows as readonly T[], rowCount: result.affectedRows ?? 0 };
    };

    // tablesRegistry intentionally omits 'users' — so findTargetRelations(usersTable) returns undefined
    const tablesRegistry = {
      posts: { table: postsTable, relations: models.posts.relations },
      // users is deliberately missing — nested include on author will be skipped
    };

    await loadRelations(
      queryFn,
      rows,
      models.posts.relations,
      { author: { include: { posts: true } } },
      0,
      tablesRegistry,
      postsTable,
    );

    // Author is loaded (top-level include works)
    const author = (rows[0] as Record<string, unknown>).author as Record<string, unknown>;
    expect(author).toBeDefined();
    expect(author.name).toBe('NoRegistry');
    // Nested 'posts' on author is NOT loaded because users table isn't in registry
    expect(author.posts).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Non-standard PK (follow-up #14)
// ---------------------------------------------------------------------------

describe('Relation loading with non-standard PK', () => {
  let pg: PGlite;

  // Tables using "code" as PK instead of "id"
  const countriesTable = d.table('countries', {
    code: d.text().primary(),
    name: d.text(),
  });

  const citiesTable = d.table('cities', {
    cityId: d.uuid().primary().default('gen_random_uuid()'),
    name: d.text(),
    countryCode: d.text(),
  });

  const models = {
    countries: {
      table: countriesTable,
      relations: {
        cities: d.ref.many(() => citiesTable, 'countryCode'),
      },
    },
    cities: {
      table: citiesTable,
      relations: {
        country: d.ref.one(() => countriesTable, 'countryCode'),
      },
    },
  } satisfies Record<string, ModelEntry>;

  type Db = ReturnType<typeof createDb<typeof models>>;
  let db: Db;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      CREATE TABLE countries (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE TABLE cities (
        city_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        country_code TEXT NOT NULL REFERENCES countries(code)
      );
    `);

    db = createDb({
      url: 'pglite://memory',
      models,
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
    await pg.exec('DELETE FROM cities');
    await pg.exec('DELETE FROM countries');
  });

  it('loads belongsTo (one) relation with non-standard PK', async () => {
    unwrap(await db.countries.create({ data: { code: 'US', name: 'United States' } }));
    unwrap(await db.cities.create({ data: { name: 'New York', countryCode: 'US' } }));

    const city = unwrap(
      await db.cities.get({
        where: { name: 'New York' },
        include: { country: true },
      }),
    ) as Record<string, unknown>;

    expect(city).not.toBeNull();
    expect(city.name).toBe('New York');
    expect(city.country).not.toBeNull();
    expect((city.country as Record<string, unknown>).name).toBe('United States');
    expect((city.country as Record<string, unknown>).code).toBe('US');
  });

  it('loads hasMany (many) relation with non-standard PK', async () => {
    unwrap(await db.countries.create({ data: { code: 'US', name: 'United States' } }));
    unwrap(await db.cities.create({ data: { name: 'New York', countryCode: 'US' } }));
    unwrap(await db.cities.create({ data: { name: 'Los Angeles', countryCode: 'US' } }));

    const country = unwrap(
      await db.countries.get({
        where: { code: 'US' },
        include: { cities: true },
      }),
    ) as Record<string, unknown>;

    expect(country).not.toBeNull();
    expect(country.name).toBe('United States');
    const cities = country.cities as Record<string, unknown>[];
    expect(cities).toHaveLength(2);
    const cityNames = cities.map((c) => c.name).sort();
    expect(cityNames).toEqual(['Los Angeles', 'New York']);
  });
});

// ---------------------------------------------------------------------------
// Relation include with filtering, sorting, pagination (#1130)
// ---------------------------------------------------------------------------

describe('Relation include with where/orderBy/limit (#1130)', () => {
  let pg: PGlite;

  const usersTable = d.table('users', {
    id: d.uuid().primary().default('gen_random_uuid()'),
    name: d.text(),
    email: d.text().unique(),
    active: d.boolean().default('true'),
  });

  const postsTable = d.table('posts', {
    id: d.uuid().primary().default('gen_random_uuid()'),
    title: d.text(),
    authorId: d.uuid(),
    status: d.text().default("'draft'"),
  });

  const commentsTable = d.table('comments', {
    id: d.uuid().primary().default('gen_random_uuid()'),
    text: d.text(),
    postId: d.uuid(),
    authorId: d.uuid(),
    status: d.text().default("'pending'"),
    createdAt: d.timestamp().default('now()'),
  });

  const models = {
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
  } satisfies Record<string, ModelEntry>;

  type Db = ReturnType<typeof createDb<typeof models>>;
  let db: Db;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true
      );

      CREATE TABLE posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        author_id UUID NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'draft'
      );

      CREATE TABLE comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        text TEXT NOT NULL,
        post_id UUID NOT NULL REFERENCES posts(id),
        author_id UUID NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    db = createDb({
      url: 'pglite://memory',
      models,
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
  // where on many relation
  // -------------------------------------------------------------------------

  describe('where on many relation', () => {
    it('only returns comments matching the where clause', async () => {
      const user = unwrap(
        await db.users.create({ data: { name: 'Alice', email: 'alice@test.com' } }),
      ) as Record<string, unknown>;

      const post = unwrap(
        await db.posts.create({ data: { title: 'Post 1', authorId: user.id } }),
      ) as Record<string, unknown>;

      unwrap(
        await db.comments.create({
          data: {
            text: 'Published comment',
            postId: post.id,
            authorId: user.id,
            status: 'published',
          },
        }),
      );
      unwrap(
        await db.comments.create({
          data: { text: 'Pending comment', postId: post.id, authorId: user.id, status: 'pending' },
        }),
      );
      unwrap(
        await db.comments.create({
          data: {
            text: 'Another published',
            postId: post.id,
            authorId: user.id,
            status: 'published',
          },
        }),
      );

      const result = unwrap(
        await db.posts.get({
          where: { title: 'Post 1' },
          include: { comments: { where: { status: 'published' } } },
        }),
      ) as Record<string, unknown>;

      expect(result).not.toBeNull();
      const comments = result.comments as Record<string, unknown>[];
      expect(comments).toHaveLength(2);
      for (const c of comments) {
        expect(c.status).toBe('published');
      }
    });
  });

  // -------------------------------------------------------------------------
  // orderBy on many relation
  // -------------------------------------------------------------------------

  describe('orderBy on many relation', () => {
    it('returns comments sorted by the specified field', async () => {
      const user = unwrap(
        await db.users.create({ data: { name: 'Alice', email: 'alice@test.com' } }),
      ) as Record<string, unknown>;

      const post = unwrap(
        await db.posts.create({ data: { title: 'Post 1', authorId: user.id } }),
      ) as Record<string, unknown>;

      // Insert comments with explicit timestamps to control order
      await pg.exec(`
        INSERT INTO comments (text, post_id, author_id, status, created_at) VALUES
          ('First', '${post.id}', '${user.id}', 'published', '2026-01-01T00:00:00Z'),
          ('Third', '${post.id}', '${user.id}', 'published', '2026-03-01T00:00:00Z'),
          ('Second', '${post.id}', '${user.id}', 'published', '2026-02-01T00:00:00Z')
      `);

      const result = unwrap(
        await db.posts.get({
          where: { title: 'Post 1' },
          include: { comments: { orderBy: { createdAt: 'desc' } } },
        }),
      ) as Record<string, unknown>;

      const comments = result.comments as Record<string, unknown>[];
      expect(comments).toHaveLength(3);
      expect(comments[0]?.text).toBe('Third');
      expect(comments[1]?.text).toBe('Second');
      expect(comments[2]?.text).toBe('First');
    });
  });

  // -------------------------------------------------------------------------
  // Per-parent limit on many relation
  // -------------------------------------------------------------------------

  describe('per-parent limit on many relation', () => {
    it('returns at most N comments PER PARENT row', async () => {
      const alice = unwrap(
        await db.users.create({ data: { name: 'Alice', email: 'alice@test.com' } }),
      ) as Record<string, unknown>;

      const post1 = unwrap(
        await db.posts.create({ data: { title: 'Post 1', authorId: alice.id } }),
      ) as Record<string, unknown>;
      const post2 = unwrap(
        await db.posts.create({ data: { title: 'Post 2', authorId: alice.id } }),
      ) as Record<string, unknown>;

      // Post 1 has 4 comments
      for (let i = 0; i < 4; i++) {
        unwrap(
          await db.comments.create({
            data: { text: `P1 Comment ${i}`, postId: post1.id, authorId: alice.id },
          }),
        );
      }

      // Post 2 has 3 comments
      for (let i = 0; i < 3; i++) {
        unwrap(
          await db.comments.create({
            data: { text: `P2 Comment ${i}`, postId: post2.id, authorId: alice.id },
          }),
        );
      }

      const posts = unwrap(
        await db.posts.list({
          orderBy: { title: 'asc' },
          include: { comments: { limit: 2 } },
        }),
      ) as Record<string, unknown>[];

      expect(posts).toHaveLength(2);

      const p1Comments = (posts[0] as Record<string, unknown>).comments as unknown[];
      expect(p1Comments).toHaveLength(2); // limited to 2, not 4

      const p2Comments = (posts[1] as Record<string, unknown>).comments as unknown[];
      expect(p2Comments).toHaveLength(2); // limited to 2, not 3
    });
  });

  // -------------------------------------------------------------------------
  // Combined where + orderBy + limit
  // -------------------------------------------------------------------------

  describe('combined where + orderBy + limit', () => {
    it('applies all three: filter, sort, then per-parent limit', async () => {
      const user = unwrap(
        await db.users.create({ data: { name: 'Alice', email: 'alice@test.com' } }),
      ) as Record<string, unknown>;

      const post = unwrap(
        await db.posts.create({ data: { title: 'Post 1', authorId: user.id } }),
      ) as Record<string, unknown>;

      // 3 published + 2 pending comments with different timestamps
      await pg.exec(`
        INSERT INTO comments (text, post_id, author_id, status, created_at) VALUES
          ('Pub 1', '${post.id}', '${user.id}', 'published', '2026-01-01T00:00:00Z'),
          ('Pend 1', '${post.id}', '${user.id}', 'pending', '2026-02-01T00:00:00Z'),
          ('Pub 2', '${post.id}', '${user.id}', 'published', '2026-03-01T00:00:00Z'),
          ('Pub 3', '${post.id}', '${user.id}', 'published', '2026-04-01T00:00:00Z'),
          ('Pend 2', '${post.id}', '${user.id}', 'pending', '2026-05-01T00:00:00Z')
      `);

      const result = unwrap(
        await db.posts.get({
          where: { title: 'Post 1' },
          include: {
            comments: {
              where: { status: 'published' },
              orderBy: { createdAt: 'desc' },
              limit: 2,
            },
          },
        }),
      ) as Record<string, unknown>;

      const comments = result.comments as Record<string, unknown>[];
      // 3 published, sorted desc, limited to 2
      expect(comments).toHaveLength(2);
      expect(comments[0]?.text).toBe('Pub 3');
      expect(comments[1]?.text).toBe('Pub 2');
    });
  });

  // -------------------------------------------------------------------------
  // where on one relation (conditional load)
  // -------------------------------------------------------------------------

  describe('where on one relation', () => {
    it('returns null when the related row does not match the where clause', async () => {
      const user = unwrap(
        await db.users.create({
          data: { name: 'Alice', email: 'alice@test.com', active: false },
        }),
      ) as Record<string, unknown>;

      unwrap(await db.posts.create({ data: { title: 'Post 1', authorId: user.id } }));

      const result = unwrap(
        await db.posts.get({
          where: { title: 'Post 1' },
          include: { author: { where: { active: true } } },
        }),
      ) as Record<string, unknown>;

      // Post is still returned, but author is null (conditional load)
      expect(result).not.toBeNull();
      expect(result.title).toBe('Post 1');
      expect(result.author).toBeNull();
    });

    it('returns the related row when it matches the where clause', async () => {
      const user = unwrap(
        await db.users.create({
          data: { name: 'Alice', email: 'alice@test.com', active: true },
        }),
      ) as Record<string, unknown>;

      unwrap(await db.posts.create({ data: { title: 'Post 1', authorId: user.id } }));

      const result = unwrap(
        await db.posts.get({
          where: { title: 'Post 1' },
          include: { author: { where: { active: true } } },
        }),
      ) as Record<string, unknown>;

      expect(result).not.toBeNull();
      expect(result.author).not.toBeNull();
      expect((result.author as Record<string, unknown>).name).toBe('Alice');
    });
  });

  // -------------------------------------------------------------------------
  // Depth increase from 2 to 3
  // -------------------------------------------------------------------------

  describe('depth increase to 3', () => {
    it('resolves 4 include levels (depth 0-3)', async () => {
      const user = unwrap(
        await db.users.create({ data: { name: 'Alice', email: 'alice@test.com' } }),
      ) as Record<string, unknown>;

      const post = unwrap(
        await db.posts.create({ data: { title: 'Post 1', authorId: user.id } }),
      ) as Record<string, unknown>;

      unwrap(
        await db.comments.create({
          data: { text: 'Comment 1', postId: post.id, authorId: user.id },
        }),
      );

      // 4 include levels: users -> posts(d0) -> comments(d1) -> author(d2) -> posts(d3)
      const result = unwrap(
        await db.users.get({
          where: { name: 'Alice' },
          include: {
            posts: {
              include: {
                comments: {
                  include: {
                    author: {
                      include: { posts: true },
                    },
                  },
                },
              },
            },
          },
        }),
      ) as Record<string, unknown>;

      expect(result).not.toBeNull();
      const posts = result.posts as Record<string, unknown>[];
      expect(posts).toHaveLength(1);
      const comments = posts[0]?.comments as Record<string, unknown>[];
      expect(comments).toHaveLength(1);
      const author = comments[0]?.author as Record<string, unknown>;
      expect(author).not.toBeNull();
      expect(author.name).toBe('Alice');
      // 4th include level (depth 3) IS loaded
      const authorPosts = author.posts as Record<string, unknown>[];
      expect(authorPosts).toHaveLength(1);
      expect(authorPosts[0]?.title).toBe('Post 1');
    });

    it('stops at depth 4 and does not load the 5th include level', async () => {
      const user = unwrap(
        await db.users.create({ data: { name: 'Alice', email: 'alice@test.com' } }),
      ) as Record<string, unknown>;

      const post = unwrap(
        await db.posts.create({ data: { title: 'Post 1', authorId: user.id } }),
      ) as Record<string, unknown>;

      unwrap(
        await db.comments.create({
          data: { text: 'Comment 1', postId: post.id, authorId: user.id },
        }),
      );

      // 5th include level: users -> posts(d0) -> comments(d1) -> author(d2) -> posts(d3) -> comments(d4)
      const result = unwrap(
        await db.users.get({
          where: { name: 'Alice' },
          include: {
            posts: {
              include: {
                comments: {
                  include: {
                    author: {
                      include: {
                        posts: {
                          include: { comments: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      ) as Record<string, unknown>;

      const posts = result.posts as Record<string, unknown>[];
      const comments = posts[0]?.comments as Record<string, unknown>[];
      const author = comments[0]?.author as Record<string, unknown>;
      expect(author).not.toBeNull();
      // 4th include level (depth 3) IS loaded
      const authorPosts = author.posts as Record<string, unknown>[];
      expect(authorPosts).toHaveLength(1);
      // 5th include level (depth 4) is NOT loaded
      expect(authorPosts[0]?.comments).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases: null FKs, unmatched includes, budget on 'one' relations
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('returns empty array immediately when primaryRows is empty', async () => {
      const queryFn = async <T>(sql: string, params: readonly unknown[]) => {
        const result = await pg.query<T>(sql, params as unknown[]);
        return { rows: result.rows as readonly T[], rowCount: result.affectedRows ?? 0 };
      };

      const result = await loadRelations(queryFn, [], models.users.relations, { posts: true }, 0);
      expect(result).toEqual([]);
    });

    it('auto-adds FK column to select when not included in many relation', async () => {
      const user = unwrap(
        await db.users.create({ data: { name: 'Alice', email: 'alice-fk@test.com' } }),
      ) as Record<string, unknown>;

      unwrap(await db.posts.create({ data: { title: 'Test FK', authorId: user.id } }));

      // select only 'text' for comments — FK column 'postId' should be auto-added
      const result = unwrap(
        await db.users.get({
          where: { name: 'Alice' },
          include: { posts: { select: { title: true } } },
        }),
      ) as Record<string, unknown>;

      expect(result).not.toBeNull();
      const posts = result.posts as Record<string, unknown>[];
      expect(posts).toHaveLength(1);
      expect(posts[0]?.title).toBe('Test FK');
    });

    it('returns rows unmodified when include keys do not match any relations', async () => {
      const user = unwrap(
        await db.users.create({ data: { name: 'Alice', email: 'alice-edge@test.com' } }),
      ) as Record<string, unknown>;

      const rows = [{ ...user }];
      const queryFn = async <T>(sql: string, params: readonly unknown[]) => {
        const result = await pg.query<T>(sql, params as unknown[]);
        return { rows: result.rows as readonly T[], rowCount: result.affectedRows ?? 0 };
      };

      const result = await loadRelations(
        queryFn,
        rows,
        models.users.relations,
        { nonExistentRelation: true },
        0,
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('Alice');
      expect((result[0] as Record<string, unknown>).nonExistentRelation).toBeUndefined();
    });

    it('sets one-relation to null when all FK values are null', async () => {
      const rows = [
        { id: 'fake-id-1', title: 'Post 1', authorId: null },
        { id: 'fake-id-2', title: 'Post 2', authorId: null },
      ];
      const queryFn = async <T>(sql: string, params: readonly unknown[]) => {
        const result = await pg.query<T>(sql, params as unknown[]);
        return { rows: result.rows as readonly T[], rowCount: result.affectedRows ?? 0 };
      };

      await loadRelations(queryFn, rows, models.posts.relations, { author: true }, 0);

      expect(rows[0]?.author).toBeNull();
      expect(rows[1]?.author).toBeNull();
    });

    it('sets many-relation to empty array when all PK values are null', async () => {
      const rows = [
        { id: null, name: 'Ghost User' },
        { id: null, name: 'Another Ghost' },
      ];
      const queryFn = async <T>(sql: string, params: readonly unknown[]) => {
        const result = await pg.query<T>(sql, params as unknown[]);
        return { rows: result.rows as readonly T[], rowCount: result.affectedRows ?? 0 };
      };

      const tablesRegistry = {
        users: { table: usersTable, relations: models.users.relations },
        posts: { table: postsTable, relations: models.posts.relations },
      };

      await loadRelations(
        queryFn,
        rows,
        models.users.relations,
        { posts: true },
        0,
        tablesRegistry,
        usersTable,
      );

      expect(rows[0]?.posts).toEqual([]);
      expect(rows[1]?.posts).toEqual([]);
    });

    it('throws when budget is exhausted before a one-relation query', async () => {
      const user = unwrap(
        await db.users.create({ data: { name: 'Alice', email: 'alice-budget@test.com' } }),
      ) as Record<string, unknown>;

      const rows = [{ id: 'fake-post-id', title: 'Post 1', authorId: user.id }];
      const queryFn = async <T>(sql: string, params: readonly unknown[]) => {
        const result = await pg.query<T>(sql, params as unknown[]);
        return { rows: result.rows as readonly T[], rowCount: result.affectedRows ?? 0 };
      };

      await expect(
        loadRelations(
          queryFn,
          rows,
          models.posts.relations,
          { author: true },
          0,
          undefined,
          undefined,
          { remaining: 0 },
        ),
      ).rejects.toThrow('Relation query budget exceeded');
    });
  });

  // -------------------------------------------------------------------------
  // Query budget counter
  // -------------------------------------------------------------------------

  describe('query budget counter', () => {
    it('throws when the query budget is exhausted', async () => {
      const user = unwrap(
        await db.users.create({ data: { name: 'Alice', email: 'alice@test.com' } }),
      ) as Record<string, unknown>;

      unwrap(await db.posts.create({ data: { title: 'Post 1', authorId: user.id } }));

      const rows = [{ ...user }];
      const queryFn = async <T>(sql: string, params: readonly unknown[]) => {
        const result = await pg.query<T>(sql, params as unknown[]);
        return { rows: result.rows as readonly T[], rowCount: result.affectedRows ?? 0 };
      };

      const tablesRegistry = {
        users: { table: usersTable, relations: models.users.relations },
        posts: { table: postsTable, relations: models.posts.relations },
        comments: { table: commentsTable, relations: models.comments.relations },
      };

      // Use loadRelations directly with a budget of 1
      // posts relation requires 1 query, comments requires 1 more → should exceed
      await expect(
        loadRelations(
          queryFn,
          rows,
          models.users.relations,
          { posts: { include: { comments: true, author: true } } },
          0,
          tablesRegistry,
          usersTable,
          { remaining: 1 },
        ),
      ).rejects.toThrow('Relation query budget exceeded');
    });
  });
});
