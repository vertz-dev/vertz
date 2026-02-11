import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '../client/database';
import { d } from '../d';
import { ForeignKeyError, NotFoundError, UniqueConstraintError } from '../errors/db-error';
import type { QueryFn } from '../query/executor';
import { createRegistry } from '../schema/registry';
import { sql } from '../sql/tagged';

// ---------------------------------------------------------------------------
// Schema definition — organizations, users, posts, comments, featureFlags
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

// ---------------------------------------------------------------------------
// Table registry — using createRegistry() for type-safe relations
// ---------------------------------------------------------------------------

const tables = createRegistry({ organizations, users, posts, comments, featureFlags }, (ref) => ({
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
// Stable UUIDs for tests
// ---------------------------------------------------------------------------

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const USER2_ID = '22222222-2222-2222-2222-222222222233';
const POST_ID = '33333333-3333-3333-3333-333333333333';
const POST2_ID = '33333333-3333-3333-3333-333333333344';
const COMMENT_ID = '44444444-4444-4444-4444-444444444444';
const FLAG_ID = '55555555-5555-5555-5555-555555555555';

// ---------------------------------------------------------------------------
// E2E Test Suite
// ---------------------------------------------------------------------------

describe('E2E Acceptance Test (db-018)', () => {
  let pg: PGlite;
  let queryFn: QueryFn;
  let db: ReturnType<typeof createDb<typeof tables>>;

  beforeAll(async () => {
    pg = new PGlite();

    // Create the query function adapter for PGlite
    queryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
      const result = await pg.query(sqlStr, params as unknown[]);
      return {
        rows: result.rows as readonly T[],
        // PGlite exposes affectedRows for INSERT/UPDATE/DELETE without RETURNING
        rowCount: result.affectedRows ?? result.rows.length,
      };
    };

    // Create the DDL tables using raw SQL (simulating push)
    await pg.exec(`
      CREATE TYPE user_role AS ENUM ('admin', 'editor', 'viewer');
      CREATE TYPE post_status AS ENUM ('draft', 'published', 'archived');

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
        "role" user_role NOT NULL DEFAULT 'viewer',
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      );

      CREATE TABLE "posts" (
        "id" uuid PRIMARY KEY,
        "author_id" uuid NOT NULL REFERENCES "users"("id"),
        "title" text NOT NULL,
        "content" text NOT NULL,
        "status" post_status NOT NULL DEFAULT 'draft',
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
      tables,
      _queryFn: queryFn,
    });
  });

  afterAll(async () => {
    await pg.close();
  });

  // =========================================================================
  // 1. Type inference assertions
  // =========================================================================

  describe('1. Type inference assertions', () => {
    it('$infer excludes hidden columns (passwordHash)', () => {
      type UserInfer = typeof users.$infer;
      const _check: UserInfer = {
        id: '',
        organizationId: '',
        name: '',
        email: '',
        role: 'admin',
        active: true,
        createdAt: new Date(),
      };
      // passwordHash is hidden and should not be in $infer
      // @ts-expect-error — passwordHash is hidden, not in $infer
      _check.passwordHash;
      void _check;
    });

    it('$not_sensitive excludes sensitive AND hidden columns', () => {
      type UserPublic = typeof users.$not_sensitive;
      const _check: UserPublic = {
        id: '',
        organizationId: '',
        name: '',
        role: 'admin',
        active: true,
        createdAt: new Date(),
      };
      // @ts-expect-error — email is sensitive, not in $not_sensitive
      _check.email;
      // @ts-expect-error — passwordHash is hidden, not in $not_sensitive
      _check.passwordHash;
      void _check;
    });

    it('$insert makes defaulted columns optional', () => {
      type UserInsert = typeof users.$insert;
      const _valid: UserInsert = {
        organizationId: ORG_ID,
        name: 'Test',
        email: 'test@example.com',
        passwordHash: 'hashed',
      };
      void _valid;

      // @ts-expect-error — name is required, missing it causes error
      const _invalid: UserInsert = {
        organizationId: ORG_ID,
        email: 'test@example.com',
        passwordHash: 'hashed',
      };
      void _invalid;
    });
  });

  // =========================================================================
  // 2. CRUD operations
  // =========================================================================

  describe('2. CRUD operations', () => {
    it('creates an organization', async () => {
      const org = await db.create('organizations', {
        data: {
          id: ORG_ID,
          name: 'Acme Corp',
          slug: 'acme',
        },
      });

      expect(org).toBeDefined();
      expect((org as Record<string, unknown>).id).toBe(ORG_ID);
      expect((org as Record<string, unknown>).name).toBe('Acme Corp');
      expect((org as Record<string, unknown>).slug).toBe('acme');
    });

    it('creates a user', async () => {
      const user = await db.create('users', {
        data: {
          id: USER_ID,
          organizationId: ORG_ID,
          name: 'Alice',
          email: 'alice@acme.com',
          passwordHash: 'hash123',
        },
      });

      expect(user).toBeDefined();
      expect((user as Record<string, unknown>).id).toBe(USER_ID);
      expect((user as Record<string, unknown>).name).toBe('Alice');
    });

    it('creates a second user', async () => {
      const user = await db.create('users', {
        data: {
          id: USER2_ID,
          organizationId: ORG_ID,
          name: 'Bob',
          email: 'bob@acme.com',
          passwordHash: 'hash456',
        },
      });

      expect(user).toBeDefined();
      expect((user as Record<string, unknown>).name).toBe('Bob');
    });

    it('creates posts', async () => {
      const post1 = await db.create('posts', {
        data: {
          id: POST_ID,
          authorId: USER_ID,
          title: 'First Post',
          content: 'Hello World',
          status: 'published',
          views: 100,
        },
      });

      expect(post1).toBeDefined();
      expect((post1 as Record<string, unknown>).title).toBe('First Post');

      const post2 = await db.create('posts', {
        data: {
          id: POST2_ID,
          authorId: USER_ID,
          title: 'Second Post',
          content: 'More content',
          status: 'draft',
          views: 5,
        },
      });

      expect(post2).toBeDefined();
      expect((post2 as Record<string, unknown>).title).toBe('Second Post');
    });

    it('creates a comment', async () => {
      const comment = await db.create('comments', {
        data: {
          id: COMMENT_ID,
          postId: POST_ID,
          authorId: USER2_ID,
          body: 'Great post!',
        },
      });

      expect(comment).toBeDefined();
      expect((comment as Record<string, unknown>).body).toBe('Great post!');
    });

    it('creates a feature flag', async () => {
      const flag = await db.create('featureFlags', {
        data: {
          id: FLAG_ID,
          name: 'dark_mode',
          enabled: true,
        },
      });

      expect(flag).toBeDefined();
      expect((flag as Record<string, unknown>).name).toBe('dark_mode');
    });

    it('updates a post', async () => {
      const updated = await db.update('posts', {
        where: { id: POST_ID },
        data: { views: 150, status: 'published' },
      });

      expect(updated).toBeDefined();
      expect((updated as Record<string, unknown>).views).toBe(150);
    });

    it('deletes a comment', async () => {
      const deleted = await db.delete('comments', {
        where: { id: COMMENT_ID },
      });

      expect(deleted).toBeDefined();
      expect((deleted as Record<string, unknown>).id).toBe(COMMENT_ID);

      // Verify it is gone
      const result = await db.findOne('comments', {
        where: { id: COMMENT_ID },
      });
      expect(result).toBeNull();
    });

    it('re-creates the comment for subsequent tests', async () => {
      await db.create('comments', {
        data: {
          id: COMMENT_ID,
          postId: POST_ID,
          authorId: USER2_ID,
          body: 'Great post!',
        },
      });
    });
  });

  // =========================================================================
  // 3. Relation includes
  // =========================================================================

  describe('3. Relation includes', () => {
    it('findMany posts with include author', async () => {
      const postsResult = await db.findMany('posts', {
        include: { author: true },
      });

      expect(postsResult.length).toBeGreaterThan(0);

      // Each post should have an author object
      for (const post of postsResult) {
        const p = post as Record<string, unknown>;
        expect(p.author).toBeDefined();
        expect((p.author as Record<string, unknown>).id).toBe(USER_ID);
        expect((p.author as Record<string, unknown>).name).toBe('Alice');
      }
    });

    it('findMany posts with include comments', async () => {
      const postsResult = await db.findMany('posts', {
        where: { id: POST_ID },
        include: { comments: true },
      });

      expect(postsResult).toHaveLength(1);
      const post = postsResult[0] as Record<string, unknown>;
      const postComments = post.comments as unknown[];
      expect(postComments).toHaveLength(1);
      expect((postComments[0] as Record<string, unknown>).body).toBe('Great post!');
    });
  });

  // =========================================================================
  // 4. Select narrowing
  // =========================================================================

  describe('4. Select narrowing', () => {
    it('select: { title: true, status: true } narrows returned fields', async () => {
      const result = await db.findMany('posts', {
        select: { title: true, status: true },
      });

      expect(result.length).toBeGreaterThan(0);
      const first = result[0] as Record<string, unknown>;
      expect(first.title).toBeDefined();
      expect(first.status).toBeDefined();

      // Content should not be returned when using explicit select
      // (At runtime, only selected columns are fetched from DB)
      expect(first.content).toBeUndefined();
    });
  });

  // =========================================================================
  // 5. Visibility filter
  // =========================================================================

  describe('5. Visibility filter', () => {
    it('select: { not: "sensitive" } excludes email', async () => {
      const result = await db.findMany('users', {
        select: { not: 'sensitive' },
      });

      expect(result.length).toBeGreaterThan(0);
      const first = result[0] as Record<string, unknown>;

      // Name should be present
      expect(first.name).toBeDefined();

      // Email is sensitive — should not be returned
      expect(first.email).toBeUndefined();

      // passwordHash is hidden — should not be returned either
      expect(first.passwordHash).toBeUndefined();
    });
  });

  // =========================================================================
  // 6. Filter operators
  // =========================================================================

  describe('6. Filter operators', () => {
    it('gte, in, and contains work correctly', async () => {
      const result = await db.findMany('posts', {
        where: {
          views: { gte: 0 },
          status: { in: ['published', 'draft'] },
          title: { contains: 'Post' },
        },
      });

      expect(result.length).toBeGreaterThan(0);
      for (const post of result) {
        const p = post as Record<string, unknown>;
        expect(typeof p.title === 'string' && p.title.includes('Post')).toBe(true);
      }
    });

    it('eq filter works as direct value shorthand', async () => {
      const result = await db.findMany('posts', {
        where: { title: 'First Post' },
      });

      expect(result).toHaveLength(1);
      expect((result[0] as Record<string, unknown>).title).toBe('First Post');
    });

    it('gt filter works for numeric columns', async () => {
      const result = await db.findMany('posts', {
        where: { views: { gt: 50 } },
      });

      expect(result).toHaveLength(1);
      expect((result[0] as Record<string, unknown>).title).toBe('First Post');
    });
  });

  // =========================================================================
  // 7. findManyAndCount
  // =========================================================================

  describe('7. findManyAndCount', () => {
    it('returns paginated results with total count', async () => {
      const { data, total } = await db.findManyAndCount('posts', {
        limit: 1,
        offset: 0,
        orderBy: { views: 'desc' },
      });

      expect(data).toHaveLength(1);
      expect(total).toBe(2); // We have 2 posts total
      expect((data[0] as Record<string, unknown>).title).toBe('First Post');
    });

    it('returns second page correctly', async () => {
      const { data, total } = await db.findManyAndCount('posts', {
        limit: 1,
        offset: 1,
        orderBy: { views: 'desc' },
      });

      expect(data).toHaveLength(1);
      expect(total).toBe(2);
      expect((data[0] as Record<string, unknown>).title).toBe('Second Post');
    });
  });

  // =========================================================================
  // 8. Error handling
  // =========================================================================

  describe('8. Error handling', () => {
    it('throws UniqueConstraintError on duplicate email', async () => {
      try {
        await db.create('users', {
          data: {
            id: '99999999-9999-9999-9999-999999999999',
            organizationId: ORG_ID,
            name: 'Duplicate Alice',
            email: 'alice@acme.com', // Duplicate email
            passwordHash: 'hash',
          },
        });
        // Should not reach here
        expect.unreachable('Should have thrown UniqueConstraintError');
      } catch (error) {
        // PGlite throws raw PG errors, which the executor maps
        expect(error).toBeInstanceOf(UniqueConstraintError);
        const uErr = error as UniqueConstraintError;
        expect(uErr.code).toBe('UNIQUE_VIOLATION');
        expect(uErr.table).toBeDefined();
      }
    });

    it('throws ForeignKeyError on invalid FK reference', async () => {
      try {
        await db.create('posts', {
          data: {
            id: '99999999-9999-9999-9999-999999999998',
            authorId: '00000000-0000-0000-0000-000000000000', // Non-existent user
            title: 'Invalid Post',
            content: 'This should fail',
          },
        });
        expect.unreachable('Should have thrown ForeignKeyError');
      } catch (error) {
        expect(error).toBeInstanceOf(ForeignKeyError);
        const fkErr = error as ForeignKeyError;
        expect(fkErr.code).toBe('FOREIGN_KEY_VIOLATION');
        expect(fkErr.table).toBeDefined();
      }
    });

    it('throws NotFoundError on findOneOrThrow with no match', async () => {
      try {
        await db.findOneOrThrow('posts', {
          where: { id: '00000000-0000-0000-0000-000000000000' },
        });
        expect.unreachable('Should have thrown NotFoundError');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError);
        const nfErr = error as NotFoundError;
        expect(nfErr.code).toBe('NOT_FOUND');
        expect(nfErr.table).toBe('posts');
      }
    });
  });

  // =========================================================================
  // 9. SQL escape hatch
  // =========================================================================

  describe('9. SQL escape hatch', () => {
    it('executes parameterized raw SQL via sql tagged template', async () => {
      const minViews = 50;
      const fragment = sql`SELECT "title", "views" FROM "posts" WHERE "views" > ${minViews} ORDER BY "views" DESC`;

      const result = await db.query<{ title: string; views: number }>(fragment);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.title).toBe('First Post');
      expect(result.rows[0]?.views).toBe(150);
    });

    it('composes nested SQL fragments', async () => {
      const whereClause = sql`WHERE "status" = ${'published'}`;
      const fragment = sql`SELECT "id", "title" FROM "posts" ${whereClause}`;

      const result = await db.query<{ id: string; title: string }>(fragment);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.title).toBe('First Post');
    });
  });

  // =========================================================================
  // 10. Tenant graph
  // =========================================================================

  describe('10. Tenant graph', () => {
    it('computes tenant graph correctly', () => {
      const graph = db.$tenantGraph;

      // organizations is the root (users have d.tenant(organizations))
      expect(graph.root).toBe('organizations');

      // users is directly scoped (has d.tenant(organizations))
      expect(graph.directlyScoped).toContain('users');

      // posts references users -> indirectly scoped
      // comments references posts -> indirectly scoped
      expect(graph.indirectlyScoped).toContain('posts');
      expect(graph.indirectlyScoped).toContain('comments');

      // featureFlags is .shared()
      expect(graph.shared).toContain('featureFlags');
    });
  });

  // =========================================================================
  // Additional integration coverage
  // =========================================================================

  describe('Additional coverage', () => {
    it('count returns correct number', async () => {
      const count = await db.count('posts');
      expect(count).toBe(2);
    });

    it('count with where filter', async () => {
      const count = await db.count('posts', {
        where: { status: 'published' },
      });
      expect(count).toBe(1);
    });

    it('updateMany returns correct count', async () => {
      const result = await db.updateMany('posts', {
        where: { status: 'draft' },
        data: { views: 10 },
      });
      expect(result.count).toBe(1);
    });

    it('deleteMany returns correct count', async () => {
      // Insert a temp post to delete
      await db.create('posts', {
        data: {
          id: '88888888-8888-8888-8888-888888888888',
          authorId: USER_ID,
          title: 'Temp Post',
          content: 'To be deleted',
          status: 'draft',
        },
      });

      const result = await db.deleteMany('posts', {
        where: { id: '88888888-8888-8888-8888-888888888888' },
      });
      expect(result.count).toBe(1);
    });

    it('upsert creates a new row', async () => {
      const result = await db.upsert('featureFlags', {
        where: { name: 'new_feature' },
        create: {
          id: '66666666-6666-6666-6666-666666666666',
          name: 'new_feature',
          enabled: false,
        },
        update: { enabled: true },
      });

      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).name).toBe('new_feature');
    });

    it('upsert updates existing row', async () => {
      const result = await db.upsert('featureFlags', {
        where: { name: 'new_feature' },
        create: {
          id: '77777777-7777-7777-7777-777777777777',
          name: 'new_feature',
          enabled: false,
        },
        update: { enabled: true },
      });

      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).enabled).toBe(true);
    });

    it('createMany inserts multiple rows', async () => {
      const result = await db.createMany('featureFlags', {
        data: [
          { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'feature_a', enabled: true },
          { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'feature_b', enabled: false },
        ],
      });

      expect(result.count).toBe(2);
    });

    it('findOne returns null when not found', async () => {
      const result = await db.findOne('posts', {
        where: { id: '00000000-0000-0000-0000-000000000000' },
      });
      expect(result).toBeNull();
    });

    it('findOneOrThrow returns the row when found', async () => {
      const result = await db.findOneOrThrow('posts', {
        where: { id: POST_ID },
      });
      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).id).toBe(POST_ID);
    });
  });
});
