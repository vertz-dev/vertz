/**
 * Integration tests for the @vertz/db package using PGlite (in-memory Postgres).
 *
 * These tests verify that the @vertz/db package works end-to-end without
 * requiring an external PostgreSQL instance.
 *
 * **Test isolation (#207):** Each describe block sets up its own data and
 * cleans up after itself. Tests can run in any order without failure.
 * Unique identifiers per test group prevent cross-test collisions.
 */

import { PGlite } from '@electric-sql/pglite';
import { unwrap } from '@vertz/schema';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../client/database';
import { d } from '../d';
import type { QueryFn } from '../query/executor';
import { createRegistry } from '../schema/registry';
import { sql } from '../sql/tagged';

// ---------------------------------------------------------------------------
// Schema definition — same structure as e2e.test.ts for consistency
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
  role: d.enum('user_role_pgint', ['admin', 'editor', 'viewer']).default('viewer'),
  active: d.boolean().default(true),
  createdAt: d.timestamp().default('now'),
});

const posts = d.table('posts', {
  id: d.uuid().primary(),
  authorId: d.uuid().references('users', 'id'),
  title: d.text(),
  content: d.text(),
  status: d.enum('post_status_pgint', ['draft', 'published', 'archived']).default('draft'),
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

// ---------------------------------------------------------------------------
// Table registry with relations
// ---------------------------------------------------------------------------

const models = createRegistry({ organizations, users, posts, comments, featureFlags }, (ref) => ({
  posts: {
    author: ref.posts.one('users', 'authorId'),
    comments: ref.posts.many('comments', 'postId'),
  },
  comments: {
    post: ref.comments.one('posts', 'postId'),
    author: ref.comments.one('users', 'authorId'),
  },
}));

// ---------------------------------------------------------------------------
// Helper: generate unique UUIDs per test group to avoid collisions
// ---------------------------------------------------------------------------

let groupCounter = 0;

function testIds() {
  const g = ++groupCounter;
  const pad = String(g).padStart(2, '0');
  return {
    ORG_ID: `a1${pad}1111-1111-1111-1111-111111111111`,
    USER_ID: `a2${pad}2222-2222-2222-2222-222222222222`,
    USER2_ID: `a2${pad}2222-2222-2222-2222-222222222233`,
    POST_ID: `a3${pad}3333-3333-3333-3333-333333333333`,
    POST2_ID: `a3${pad}3333-3333-3333-3333-333333333344`,
    COMMENT_ID: `a4${pad}4444-4444-4444-4444-444444444444`,
    FLAG_ID: `a5${pad}5555-5555-5555-5555-555555555555`,
  };
}

// ---------------------------------------------------------------------------
// Helper: seed standard test data
// ---------------------------------------------------------------------------

async function seedTestData(
  db: ReturnType<typeof createDb<typeof models>>,
  ids: ReturnType<typeof testIds>,
  suffix: string,
) {
  unwrap(
    await db.create('organizations', {
      data: { id: ids.ORG_ID, name: 'Acme Corp', slug: `acme-${suffix}` },
    }),
  );
  unwrap(
    await db.create('users', {
      data: {
        id: ids.USER_ID,
        organizationId: ids.ORG_ID,
        name: 'Alice',
        email: `alice-${suffix}@acme.com`,
        passwordHash: 'hash123',
      },
    }),
  );
  unwrap(
    await db.create('users', {
      data: {
        id: ids.USER2_ID,
        organizationId: ids.ORG_ID,
        name: 'Bob',
        email: `bob-${suffix}@acme.com`,
        passwordHash: 'hash456',
      },
    }),
  );
  unwrap(
    await db.create('posts', {
      data: {
        id: ids.POST_ID,
        authorId: ids.USER_ID,
        title: 'First Post',
        content: 'Hello World',
        status: 'published',
        views: 100,
      },
    }),
  );
  unwrap(
    await db.create('posts', {
      data: {
        id: ids.POST2_ID,
        authorId: ids.USER_ID,
        title: 'Second Post',
        content: 'More content',
        status: 'draft',
        views: 5,
      },
    }),
  );
  unwrap(
    await db.create('comments', {
      data: {
        id: ids.COMMENT_ID,
        postId: ids.POST_ID,
        authorId: ids.USER2_ID,
        body: 'Great post!',
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Helper: clean all data from tables (order respects FK constraints)
// ---------------------------------------------------------------------------

async function truncateAll(pg: PGlite) {
  await pg.exec('TRUNCATE "comments", "posts", "users", "organizations", "feature_flags" CASCADE');
}

// ---------------------------------------------------------------------------
// Integration Test Suite
// ---------------------------------------------------------------------------

describe('PostgreSQL Integration Tests (PGlite)', () => {
  let pg: PGlite;
  let db: ReturnType<typeof createDb<typeof models>>;

  beforeAll(async () => {
    pg = new PGlite();

    // Create the query function adapter for PGlite
    const queryFn: QueryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
      const result = await pg.query(sqlStr, params as unknown[]);
      return {
        rows: result.rows as readonly T[],
        rowCount: result.affectedRows ?? result.rows.length,
      };
    };

    // Create the DDL tables using raw SQL
    await pg.exec(`
      CREATE TYPE user_role_pgint AS ENUM ('admin', 'editor', 'viewer');
      CREATE TYPE post_status_pgint AS ENUM ('draft', 'published', 'archived');

      CREATE TABLE "organizations" (
        "id" uuid PRIMARY KEY,
        "name" text NOT NULL,
        "slug" text NOT NULL UNIQUE,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      );

      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY,
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
        "name" text NOT NULL,
        "email" text NOT NULL UNIQUE,
        "password_hash" text NOT NULL,
        "role" user_role_pgint NOT NULL DEFAULT 'viewer',
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      );

      CREATE TABLE "posts" (
        "id" uuid PRIMARY KEY,
        "author_id" uuid NOT NULL REFERENCES "users"("id"),
        "title" text NOT NULL,
        "content" text NOT NULL,
        "status" post_status_pgint NOT NULL DEFAULT 'draft',
        "views" integer NOT NULL DEFAULT 0,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT now()
      );

      CREATE TABLE "comments" (
        "id" uuid PRIMARY KEY,
        "post_id" uuid NOT NULL REFERENCES "posts"("id"),
        "author_id" uuid NOT NULL REFERENCES "users"("id"),
        "body" text NOT NULL,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      );

      CREATE TABLE "feature_flags" (
        "id" uuid PRIMARY KEY,
        "name" text NOT NULL UNIQUE,
        "enabled" boolean NOT NULL DEFAULT false
      );
    `);

    // Create db instance with PGlite query function
    db = createDb({
      url: 'pglite://memory',
      models,
      _queryFn: queryFn,
    });
  });

  afterAll(async () => {
    await pg.close();
  });

  // =========================================================================
  // 2. Create + get roundtrip (self-contained)
  // =========================================================================

  describe('2. Create + get roundtrip', () => {
    const ids = testIds();

    afterEach(async () => {
      await truncateAll(pg);
    });

    it('creates an organization and finds it back', async () => {
      const org = unwrap(
        await db.create('organizations', {
          data: { id: ids.ORG_ID, name: 'Acme Corp', slug: 'acme-create-test' },
        }),
      );

      expect(org).toBeDefined();
      expect(org.id).toBe(ids.ORG_ID);
      expect(org.name).toBe('Acme Corp');
      expect(org.slug).toBe('acme-create-test');
      expect(org.createdAt).toBeInstanceOf(Date);

      const found = unwrap(await db.get('organizations', { where: { id: ids.ORG_ID } }));
      expect(found).not.toBeNull();
      expect(found?.id).toBe(ids.ORG_ID);
      expect(found?.name).toBe('Acme Corp');
      expect(found?.createdAt).toBeInstanceOf(Date);
    });

    it('creates users', async () => {
      await db.create('organizations', {
        data: { id: ids.ORG_ID, name: 'Acme Corp', slug: 'acme-users-test' },
      });

      const user1 = unwrap(
        await db.create('users', {
          data: {
            id: ids.USER_ID,
            organizationId: ids.ORG_ID,
            name: 'Alice',
            email: 'alice-users-test@acme.com',
            passwordHash: 'hash123',
          },
        }),
      );
      expect(user1).toBeDefined();
      expect(user1.id).toBe(ids.USER_ID);
      expect(user1.name).toBe('Alice');

      const user2 = unwrap(
        await db.create('users', {
          data: {
            id: ids.USER2_ID,
            organizationId: ids.ORG_ID,
            name: 'Bob',
            email: 'bob-users-test@acme.com',
            passwordHash: 'hash456',
          },
        }),
      );
      expect(user2).toBeDefined();
      expect(user2.name).toBe('Bob');
    });

    it('creates posts', async () => {
      await db.create('organizations', {
        data: { id: ids.ORG_ID, name: 'Acme Corp', slug: 'acme-posts-test' },
      });
      await db.create('users', {
        data: {
          id: ids.USER_ID,
          organizationId: ids.ORG_ID,
          name: 'Alice',
          email: 'alice-posts-test@acme.com',
          passwordHash: 'hash123',
        },
      });

      const post1 = unwrap(
        await db.create('posts', {
          data: {
            id: ids.POST_ID,
            authorId: ids.USER_ID,
            title: 'First Post',
            content: 'Hello World',
            status: 'published',
            views: 100,
          },
        }),
      );
      expect(post1).toBeDefined();
      expect(post1.title).toBe('First Post');

      const post2 = unwrap(
        await db.create('posts', {
          data: {
            id: ids.POST2_ID,
            authorId: ids.USER_ID,
            title: 'Second Post',
            content: 'More content',
            status: 'draft',
            views: 5,
          },
        }),
      );
      expect(post2).toBeDefined();
      expect(post2.title).toBe('Second Post');
    });

    it('creates a comment', async () => {
      await seedTestData(db, ids, 'comment-test');

      // Remove the seeded comment to test creation fresh
      await db.delete('comments', { where: { id: ids.COMMENT_ID } });

      const comment = unwrap(
        await db.create('comments', {
          data: {
            id: ids.COMMENT_ID,
            postId: ids.POST_ID,
            authorId: ids.USER2_ID,
            body: 'Great post!',
          },
        }),
      );
      expect(comment).toBeDefined();
      expect(comment.body).toBe('Great post!');
    });

    it('creates a feature flag', async () => {
      const flag = unwrap(
        await db.create('featureFlags', {
          data: { id: ids.FLAG_ID, name: 'dark_mode_create', enabled: true },
        }),
      );
      expect(flag).toBeDefined();
      expect(flag.name).toBe('dark_mode_create');
      expect(flag.enabled).toBe(true);
    });
  });

  // =========================================================================
  // 3. list with where filters (self-contained)
  // =========================================================================

  describe('3. list with where filters', () => {
    const ids = testIds();

    beforeEach(async () => {
      await truncateAll(pg);
      await seedTestData(db, ids, 'findmany');
    });

    it('finds all posts', async () => {
      const result = unwrap(await db.list('posts'));
      expect(result).toHaveLength(2);
    });

    it('filters by status', async () => {
      const result = unwrap(await db.list('posts', { where: { status: 'published' } }));
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('First Post');
    });

    it('filters by views with gte', async () => {
      const result = unwrap(await db.list('posts', { where: { views: { gte: 50 } } }));
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('First Post');
    });

    it('filters with in operator', async () => {
      const result = unwrap(
        await db.list('posts', {
          where: { status: { in: ['published', 'draft'] } },
        }),
      );
      expect(result).toHaveLength(2);
    });

    it('filters with contains operator', async () => {
      const result = unwrap(await db.list('posts', { where: { title: { contains: 'First' } } }));
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('First Post');
    });

    it('filters with gt operator', async () => {
      const result = unwrap(await db.list('posts', { where: { views: { gt: 50 } } }));
      expect(result).toHaveLength(1);
    });

    it('returns empty array when no match', async () => {
      const result = unwrap(await db.list('posts', { where: { title: 'nonexistent' } }));
      expect(result).toHaveLength(0);
    });
  });

  // =========================================================================
  // 4. listAndCount with pagination (self-contained)
  // =========================================================================

  describe('4. listAndCount with pagination', () => {
    const ids = testIds();

    beforeEach(async () => {
      await truncateAll(pg);
      await seedTestData(db, ids, 'paginate');
    });

    it('returns paginated results with total count', async () => {
      const result = unwrap(
        await db.listAndCount('posts', {
          limit: 1,
          offset: 0,
          orderBy: { views: 'desc' },
        }),
      );
      const { data, total } = result;
      expect(data).toHaveLength(1);
      expect(total).toBe(2);
      expect(data[0].title).toBe('First Post');
    });

    it('returns second page correctly', async () => {
      const result = unwrap(
        await db.listAndCount('posts', {
          limit: 1,
          offset: 1,
          orderBy: { views: 'desc' },
        }),
      );
      const { data, total } = result;
      expect(data).toHaveLength(1);
      expect(total).toBe(2);
      expect(data[0].title).toBe('Second Post');
    });

    it('count returns 0 for no matches', async () => {
      const result = unwrap(
        await db.listAndCount('posts', {
          where: { title: 'nonexistent' },
        }),
      );
      const { data, total } = result;
      expect(data).toHaveLength(0);
      expect(total).toBe(0);
    });
  });

  // =========================================================================
  // 5. Update and delete (self-contained)
  // =========================================================================

  describe('5. Update and delete', () => {
    const ids = testIds();

    beforeEach(async () => {
      await truncateAll(pg);
      await seedTestData(db, ids, 'update-delete');
    });

    it('updates a post', async () => {
      const updated = unwrap(
        await db.update('posts', {
          where: { id: ids.POST_ID },
          data: { views: 200 },
        }),
      );
      expect(updated).toBeDefined();
      expect(updated.views).toBe(200);
    });

    it('updateMany returns correct count', async () => {
      const result = unwrap(
        await db.updateMany('posts', {
          where: { status: 'draft' },
          data: { views: 10 },
        }),
      );
      expect(result.count).toBe(1);
    });

    it('deletes a comment and verifies it is gone', async () => {
      const deleted = unwrap(await db.delete('comments', { where: { id: ids.COMMENT_ID } }));
      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(ids.COMMENT_ID);

      const found = unwrap(await db.get('comments', { where: { id: ids.COMMENT_ID } }));
      expect(found).toBeNull();
    });

    it('deleteMany returns correct count', async () => {
      const tempId = 'a8888888-8888-8888-8888-888888888888';
      await db.create('posts', {
        data: {
          id: tempId,
          authorId: ids.USER_ID,
          title: 'Temp Post',
          content: 'To be deleted',
          status: 'draft',
        },
      });

      const result = unwrap(await db.deleteMany('posts', { where: { id: tempId } }));
      expect(result.count).toBe(1);
    });
  });

  // =========================================================================
  // 6. Relation includes (self-contained)
  // =========================================================================

  describe('6. Relation includes', () => {
    const ids = testIds();

    beforeEach(async () => {
      await truncateAll(pg);
      await seedTestData(db, ids, 'relations');
    });

    it('list posts with include author', async () => {
      const postsResult = unwrap(await db.list('posts', { include: { author: true } }));
      expect(postsResult.length).toBeGreaterThan(0);
      for (const post of postsResult) {
        expect(post.author).toBeDefined();
        expect(post.author.id).toBe(ids.USER_ID);
        expect(post.author.name).toBe('Alice');
      }
    });

    it('list posts with include comments', async () => {
      const postsResult = unwrap(
        await db.list('posts', {
          where: { id: ids.POST_ID },
          include: { comments: true },
        }),
      );
      expect(postsResult).toHaveLength(1);
      const post = postsResult[0];
      expect(post.comments).toHaveLength(1);
      expect(post.comments[0].body).toBe('Great post!');
    });

    it('get with single include works', async () => {
      const post = unwrap(
        await db.get('posts', {
          where: { id: ids.POST_ID },
          include: { author: true },
        }),
      );
      expect(post).not.toBeNull();
      expect(post?.author).toBeDefined();
      expect(post?.author.name).toBe('Alice');
    });

    it('getOrThrow with multiple includes works', async () => {
      const post = unwrap(
        await db.getOrThrow('posts', {
          where: { id: ids.POST_ID },
          include: { author: true, comments: true },
        }),
      );
      expect(post.author).toBeDefined();
      expect(post.author.name).toBe('Alice');
      expect(post.comments).toHaveLength(1);
      expect(post.comments[0].body).toBe('Great post!');
    });

    it('listAndCount with include works', async () => {
      const result = unwrap(
        await db.listAndCount('posts', {
          where: { id: ids.POST_ID },
          include: { author: true, comments: true },
        }),
      );
      const { data } = result;
      expect(data).toHaveLength(1);
      expect(data[0].author).toBeDefined();
      expect(data[0].author.name).toBe('Alice');
      expect(data[0].comments).toHaveLength(1);
    });
  });

  // =========================================================================
  // 7. Error scenarios (self-contained)
  // =========================================================================

  describe('7. Error scenarios', () => {
    const ids = testIds();

    beforeEach(async () => {
      await truncateAll(pg);
      await seedTestData(db, ids, 'errors');
    });

    it('returns CONSTRAINT_ERROR on duplicate email', async () => {
      const result = await db.create('users', {
        data: {
          id: 'a9999999-9999-9999-9999-999999999999',
          organizationId: ids.ORG_ID,
          name: 'Duplicate Alice',
          email: 'alice-errors@acme.com', // Duplicate email
          passwordHash: 'hash',
        },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONSTRAINT_ERROR');
        expect(result.error.table).toBeDefined();
      }
    });

    it('returns CONSTRAINT_ERROR on invalid FK reference', async () => {
      const result = await db.create('posts', {
        data: {
          id: 'a9999999-9999-9999-9999-999999999998',
          authorId: '00000000-0000-0000-0000-000000000000',
          title: 'Invalid Post',
          content: 'This should fail',
        },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONSTRAINT_ERROR');
        expect(result.error.table).toBeDefined();
      }
    });

    it('returns NOT_FOUND on getOrThrow with no match', async () => {
      const result = await db.getOrThrow('posts', {
        where: { id: '00000000-0000-0000-0000-000000000000' },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.table).toBe('posts');
      }
    });

    it('returns error on update with no match', async () => {
      const result = await db.update('posts', {
        where: { id: '00000000-0000-0000-0000-000000000000' },
        data: { views: 999 },
      });
      expect(result.ok).toBe(false);
    });

    it('returns error on delete with no match', async () => {
      const result = await db.delete('posts', {
        where: { id: '00000000-0000-0000-0000-000000000000' },
      });
      expect(result.ok).toBe(false);
    });

    it('#205: raw SQL errors are captured as error results', async () => {
      // db.query() maps errors through toReadError, which returns QUERY_ERROR
      // for constraint violations (CONSTRAINT_ERROR is only in WriteError)
      const result = await db.query(sql`
        INSERT INTO "users" ("id", "organization_id", "name", "email", "password_hash")
        VALUES (${`a9999999-9999-9999-9999-999999999990`}, ${ids.ORG_ID}, ${'Dup'}, ${`alice-errors@acme.com`}, ${'h'})
      `);
      expect(result.ok).toBe(false);
    });
  });

  // =========================================================================
  // 8. Aggregation (self-contained)
  // =========================================================================

  describe('8. Aggregation', () => {
    const ids = testIds();

    beforeEach(async () => {
      await truncateAll(pg);
      await seedTestData(db, ids, 'aggregation');
    });

    it('count returns correct number', async () => {
      const result = unwrap(await db.count('posts'));
      expect(result).toBe(2);
    });

    it('count with where filter', async () => {
      const result = unwrap(await db.count('posts', { where: { status: 'published' } }));
      expect(result).toBe(1);
    });
  });

  // =========================================================================
  // 9. Upsert (self-contained)
  // =========================================================================

  describe('9. Upsert', () => {
    beforeEach(async () => {
      await truncateAll(pg);
    });

    it('upsert creates a new row', async () => {
      const result = unwrap(
        await db.upsert('featureFlags', {
          where: { name: 'new_feature_upsert' },
          create: {
            id: 'a6666666-6666-6666-6666-666666666666',
            name: 'new_feature_upsert',
            enabled: false,
          },
          update: { enabled: true },
        }),
      );
      expect(result).toBeDefined();
      expect(result.name).toBe('new_feature_upsert');
      expect(result.enabled).toBe(false);
    });

    it('upsert updates existing row', async () => {
      // Create first
      await db.create('featureFlags', {
        data: {
          id: 'a6666666-6666-6666-6666-666666666677',
          name: 'existing_feature_upsert',
          enabled: false,
        },
      });

      const result = unwrap(
        await db.upsert('featureFlags', {
          where: { name: 'existing_feature_upsert' },
          create: {
            id: 'a7777777-7777-7777-7777-777777777777',
            name: 'existing_feature_upsert',
            enabled: false,
          },
          update: { enabled: true },
        }),
      );
      expect(result).toBeDefined();
      expect(result.enabled).toBe(true);
    });
  });

  // =========================================================================
  // 10. Batch operations (self-contained)
  // =========================================================================

  describe('10. Batch operations', () => {
    const ids = testIds();

    beforeEach(async () => {
      await truncateAll(pg);
    });

    it('createMany inserts multiple rows', async () => {
      const result = unwrap(
        await db.createMany('featureFlags', {
          data: [
            { id: 'aabbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'feature_a_batch', enabled: true },
            { id: 'aacccccc-cccc-cccc-cccc-cccccccccccc', name: 'feature_b_batch', enabled: false },
          ],
        }),
      );
      expect(result.count).toBe(2);
    });

    it('get returns null when not found', async () => {
      const result = unwrap(
        await db.get('posts', {
          where: { id: '00000000-0000-0000-0000-000000000000' },
        }),
      );
      expect(result).toBeNull();
    });

    it('getOrThrow returns the row when found', async () => {
      await seedTestData(db, ids, 'batch-find');
      const result = unwrap(await db.getOrThrow('posts', { where: { id: ids.POST_ID } }));
      expect(result).toBeDefined();
      expect(result.id).toBe(ids.POST_ID);
    });
  });

  // =========================================================================
  // 11. Date handling (self-contained)
  // =========================================================================

  describe('11. Date handling', () => {
    const ids = testIds();

    beforeEach(async () => {
      await truncateAll(pg);
      await seedTestData(db, ids, 'dates');
    });

    it('timestamps are returned as Date objects', async () => {
      const org = unwrap(await db.getOrThrow('organizations', { where: { id: ids.ORG_ID } }));
      expect(org.createdAt).toBeInstanceOf(Date);
      const now = new Date();
      const diff = now.getTime() - (org.createdAt as Date).getTime();
      expect(diff).toBeLessThan(3600000);
    });

    it('post timestamps are Date objects', async () => {
      const post = unwrap(await db.getOrThrow('posts', { where: { id: ids.POST_ID } }));
      expect(post.createdAt).toBeInstanceOf(Date);
      expect(post.updatedAt).toBeInstanceOf(Date);
    });
  });

  // =========================================================================
  // 12. Select narrowing (self-contained)
  // =========================================================================

  describe('12. Select narrowing', () => {
    const ids = testIds();

    beforeEach(async () => {
      await truncateAll(pg);
      await seedTestData(db, ids, 'select');
    });

    it('select narrows returned fields', async () => {
      const result = unwrap(await db.list('posts', { select: { title: true, status: true } }));
      expect(result.length).toBeGreaterThan(0);
      const first = result[0];
      expect(first.title).toBeDefined();
      expect(first.status).toBeDefined();
      expect('content' in first).toBe(false);
    });

    it('select with not sensitive excludes email', async () => {
      const result = unwrap(await db.list('users', { select: { not: 'sensitive' } }));
      expect(result.length).toBeGreaterThan(0);
      const first = result[0];
      expect(first.name).toBeDefined();
      expect('email' in first).toBe(false);
      expect('passwordHash' in first).toBe(false);
    });
  });

  // =========================================================================
  // 13. SQL escape hatch (self-contained)
  // =========================================================================

  describe('13. SQL escape hatch', () => {
    const ids = testIds();

    beforeEach(async () => {
      await truncateAll(pg);
      await seedTestData(db, ids, 'sql-escape');
      // Update views for predictable assertion
      await db.update('posts', {
        where: { id: ids.POST_ID },
        data: { views: 200 },
      });
    });

    it('executes parameterized raw SQL', async () => {
      const minViews = 50;
      const fragment = sql`SELECT "title", "views" FROM "posts" WHERE "views" > ${minViews} ORDER BY "views" DESC`;
      const result = unwrap(await db.query<{ title: string; views: number }>(fragment));
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.title).toBe('First Post');
      expect(result.rows[0]?.views).toBe(200);
    });

    it('composes nested SQL fragments', async () => {
      const whereClause = sql`WHERE "status" = ${'published'}`;
      const fragment = sql`SELECT "id", "title" FROM "posts" ${whereClause}`;
      const result = unwrap(await db.query<{ id: string; title: string }>(fragment));
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.title).toBe('First Post');
    });
  });
});
