import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createDb } from '../client/database';
import { d } from '../d';
import type { QueryFn } from '../query/executor';
import { sql } from '../sql/tagged';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  email: d.email().unique(),
  role: d.enum('user_role', ['admin', 'user']).default('user'),
  createdAt: d.timestamp().default('now'),
});

const postsTable = d.table('posts', {
  id: d.uuid().primary(),
  authorId: d.uuid().references('users', 'id'),
  title: d.text(),
  content: d.text(),
  createdAt: d.timestamp().default('now'),
});

const models = {
  users: d.model(usersTable),
  posts: d.model(postsTable, {
    author: d.ref.one(() => usersTable, 'authorId'),
  }),
};

// ---------------------------------------------------------------------------
// Stable UUIDs
// ---------------------------------------------------------------------------

const USER_ID = '11111111-1111-1111-1111-111111111111';
const POST_ID = '22222222-2222-2222-2222-222222222222';

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Prisma-style API (db.model.method)', () => {
  let pg: PGlite;
  let db: ReturnType<typeof createDb<typeof models>>;

  beforeAll(async () => {
    pg = new PGlite();
    const queryFn: QueryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
      const result = await pg.query(sqlStr, params as unknown[]);
      return {
        rows: result.rows as readonly T[],
        rowCount: result.affectedRows ?? result.rows.length,
      };
    };

    await pg.exec(`
      CREATE TYPE user_role AS ENUM ('admin', 'user');
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY,
        "name" text NOT NULL,
        "email" text NOT NULL UNIQUE,
        "role" user_role NOT NULL DEFAULT 'user',
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      );
      CREATE TABLE "posts" (
        "id" uuid PRIMARY KEY,
        "author_id" uuid NOT NULL REFERENCES "users"("id"),
        "title" text NOT NULL,
        "content" text NOT NULL,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      );
    `);

    db = createDb({ url: 'pglite://memory', models, _queryFn: queryFn });
  });

  afterAll(async () => {
    await pg.close();
  });

  // -------------------------------------------------------------------------
  // 1. Model delegates exist as properties
  // -------------------------------------------------------------------------

  it('db.users is a model delegate with CRUD methods', () => {
    expect(db.users).toBeDefined();
    expect(typeof db.users.get).toBe('function');
    expect(typeof db.users.getRequired).toBe('function');
    expect(typeof db.users.list).toBe('function');
    expect(typeof db.users.listAndCount).toBe('function');
    expect(typeof db.users.create).toBe('function');
    expect(typeof db.users.createMany).toBe('function');
    expect(typeof db.users.createManyAndReturn).toBe('function');
    expect(typeof db.users.update).toBe('function');
    expect(typeof db.users.updateMany).toBe('function');
    expect(typeof db.users.upsert).toBe('function');
    expect(typeof db.users.delete).toBe('function');
    expect(typeof db.users.deleteMany).toBe('function');
    expect(typeof db.users.count).toBe('function');
    expect(typeof db.users.aggregate).toBe('function');
    expect(typeof db.users.groupBy).toBe('function');
  });

  it('db.posts is a model delegate with CRUD methods', () => {
    expect(db.posts).toBeDefined();
    expect(typeof db.posts.get).toBe('function');
    expect(typeof db.posts.create).toBe('function');
  });

  // -------------------------------------------------------------------------
  // 2. Top-level methods exist
  // -------------------------------------------------------------------------

  it('db.query, db.close, db.isHealthy exist at top level', () => {
    expect(typeof db.query).toBe('function');
    expect(typeof db.close).toBe('function');
    expect(typeof db.isHealthy).toBe('function');
  });

  // -------------------------------------------------------------------------
  // 3. _internals groups internal properties
  // -------------------------------------------------------------------------

  it('db._internals exposes models, dialect, tenantGraph', () => {
    expect(db._internals).toBeDefined();
    expect(db._internals.models).toBe(models);
    expect(db._internals.dialect).toBeDefined();
    expect(db._internals.tenantGraph).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 4. CRUD operations work via delegate
  // -------------------------------------------------------------------------

  it('db.users.create inserts and returns a user', async () => {
    const result = await db.users.create({
      data: { id: USER_ID, name: 'Alice', email: 'alice@test.com' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe('Alice');
      expect(result.data.email).toBe('alice@test.com');
    }
  });

  it('db.users.get retrieves the created user', async () => {
    const result = await db.users.get({ where: { id: USER_ID } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.name).toBe('Alice');
    }
  });

  it('db.users.getRequired returns user or error', async () => {
    const result = await db.users.getRequired({ where: { id: USER_ID } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe('Alice');
    }
  });

  it('db.users.list returns all users', async () => {
    const result = await db.users.list();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('db.users.listAndCount returns data and total', async () => {
    const result = await db.users.listAndCount();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.data.length).toBeGreaterThanOrEqual(1);
      expect(result.data.total).toBeGreaterThanOrEqual(1);
    }
  });

  it('db.users.update modifies and returns the user', async () => {
    const result = await db.users.update({
      where: { id: USER_ID },
      data: { name: 'Alice Updated' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe('Alice Updated');
    }
  });

  it('db.users.count returns the count', async () => {
    const result = await db.users.count();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeGreaterThanOrEqual(1);
    }
  });

  // -------------------------------------------------------------------------
  // 5. Relations work through delegates
  // -------------------------------------------------------------------------

  it('db.posts.create with relation FK', async () => {
    const result = await db.posts.create({
      data: {
        id: POST_ID,
        authorId: USER_ID,
        title: 'First Post',
        content: 'Hello world',
      },
    });
    expect(result.ok).toBe(true);
  });

  it('db.posts.get with include loads relation', async () => {
    const result = await db.posts.get({
      where: { id: POST_ID },
      include: { author: true },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.data) {
      expect(result.data.title).toBe('First Post');
      expect(result.data.author).toBeDefined();
      expect(result.data.author.name).toBe('Alice Updated');
    }
  });

  // -------------------------------------------------------------------------
  // 6. Select narrowing works
  // -------------------------------------------------------------------------

  it('db.users.get with select returns only selected fields', async () => {
    const result = await db.users.get({
      where: { id: USER_ID },
      select: { id: true, name: true },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.data) {
      expect(result.data.id).toBe(USER_ID);
      expect(result.data.name).toBeDefined();
    }
  });

  // -------------------------------------------------------------------------
  // 7. Filter operators work
  // -------------------------------------------------------------------------

  it('db.users.list with where filter', async () => {
    const result = await db.users.list({
      where: { name: { contains: 'Alice' } },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.length).toBeGreaterThanOrEqual(1);
    }
  });

  // -------------------------------------------------------------------------
  // 8. Delete works
  // -------------------------------------------------------------------------

  it('db.posts.delete removes the post', async () => {
    const result = await db.posts.delete({ where: { id: POST_ID } });
    expect(result.ok).toBe(true);
  });

  it('db.users.delete removes the user', async () => {
    const result = await db.users.delete({ where: { id: USER_ID } });
    expect(result.ok).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 9. Raw query still works at top level
  // -------------------------------------------------------------------------

  it('db.query executes raw SQL', async () => {
    const result = await db.query(sql`SELECT 1 as num`);
    expect(result.ok).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 10. Reserved name validation
  // -------------------------------------------------------------------------

  it('throws if model name collides with reserved key', () => {
    const queryModel = d.model(usersTable);
    expect(() =>
      createDb({
        models: {
          // biome-ignore lint/suspicious/noExplicitAny: Testing reserved name validation
          query: queryModel as any,
        },
        url: 'pglite://memory',
      }),
    ).toThrow(/reserved/i);
  });
});
