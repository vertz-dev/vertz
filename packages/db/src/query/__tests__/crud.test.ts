import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../client/database';
import { d } from '../../d';
import type { TableEntry } from '../../schema/inference';

/**
 * CRUD query integration tests — DB-010 acceptance criteria.
 *
 * Uses PGlite for a real PostgreSQL engine. Tests the full pipeline:
 * table definition -> createDb -> query methods -> result mapping.
 */
describe('CRUD queries (DB-010)', () => {
  let pg: PGlite;

  // Schema: users and posts tables
  const usersTable = d.table('users', {
    id: d.uuid().primary().default('gen_random_uuid()'),
    name: d.text(),
    email: d.text().unique(),
    age: d.integer().nullable(),
    active: d.boolean().default(true),
    createdAt: d.timestamp().default('now'),
  });

  const postsTable = d.table('posts', {
    id: d.uuid().primary().default('gen_random_uuid()'),
    title: d.text(),
    body: d.text().nullable(),
    authorId: d.uuid().references('users'),
    published: d.boolean().default(false),
  });

  const tables = {
    users: { table: usersTable, relations: {} },
    posts: { table: postsTable, relations: {} },
  } satisfies Record<string, TableEntry>;

  type Db = ReturnType<typeof createDb<typeof tables>>;
  let db: Db;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        age INTEGER,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        body TEXT,
        author_id UUID NOT NULL REFERENCES users(id),
        published BOOLEAN DEFAULT FALSE
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
    await pg.exec('DELETE FROM posts');
    await pg.exec('DELETE FROM users');
  });

  // -------------------------------------------------------------------------
  // find queries
  // -------------------------------------------------------------------------

  describe('get', () => {
    it('returns typed result or null when no match', async () => {
      const result = await db.get('users', { where: { name: 'Nobody' } });
      expect(result.data).toBeNull();
    });

    it('returns a row when match exists', async () => {
      await db.create('users', { data: { name: 'Alice', email: 'alice@test.com' } });
      const result = await db.get('users', { where: { name: 'Alice' } });
      expect(result.data).not.toBeNull();
      expect((result.data as Record<string, unknown>).name).toBe('Alice');
      expect((result.data as Record<string, unknown>).email).toBe('alice@test.com');
    });

    it('returns camelCase keys from snake_case columns', async () => {
      await db.create('users', { data: { name: 'Bob', email: 'bob@test.com' } });
      const result = (await db.get('users', {
        where: { name: 'Bob' },
      })) as Record<string, unknown>;
      expect(result.data).toHaveProperty('createdAt');
      // Should NOT have snake_case keys
      expect(result.data).not.toHaveProperty('created_at');
    });
  });

  describe('getOrThrow', () => {
    it('returns error Result when no match', async () => {
      const result = await db.getOrThrow('users', { where: { name: 'Nobody' } });
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('returns row when match exists', async () => {
      await db.create('users', { data: { name: 'Alice', email: 'alice@test.com' } });
      const result = (await db.getOrThrow('users', {
        where: { name: 'Alice' },
      })) as Record<string, unknown>;
      expect(result.data.name).toBe('Alice');
    });
  });

  describe('list', () => {
    it('returns array with pagination support', async () => {
      await db.create('users', { data: { name: 'Alice', email: 'a@test.com', age: 30 } });
      await db.create('users', { data: { name: 'Bob', email: 'b@test.com', age: 25 } });
      await db.create('users', { data: { name: 'Carol', email: 'c@test.com', age: 35 } });

      // No filter — return all
      const all = await db.list('users');
      expect(all.data).toHaveLength(3);

      // With limit/offset
      const page = await db.list('users', {
        orderBy: { name: 'asc' },
        limit: 2,
        offset: 0,
      });
      expect(page.data).toHaveLength(2);
      expect((page.data[0] as Record<string, unknown>).name).toBe('Alice');
      expect((page.data[1] as Record<string, unknown>).name).toBe('Bob');

      // Page 2
      const page2 = await db.list('users', {
        orderBy: { name: 'asc' },
        limit: 2,
        offset: 2,
      });
      expect(page2.data).toHaveLength(1);
      expect((page2.data[0] as Record<string, unknown>).name).toBe('Carol');
    });

    it('returns empty array when no matches', async () => {
      const result = await db.list('users', { where: { name: 'Nobody' } });
      expect(result.data).toEqual([]);
    });

    it('supports cursor-based pagination with take', async () => {
      await db.create('users', { data: { name: 'Alice', email: 'a@test.com', age: 20 } });
      await db.create('users', { data: { name: 'Bob', email: 'b@test.com', age: 25 } });
      await db.create('users', { data: { name: 'Carol', email: 'c@test.com', age: 30 } });
      await db.create('users', { data: { name: 'Dave', email: 'd@test.com', age: 35 } });

      // First page — no cursor, just take
      const page1 = await db.list('users', {
        orderBy: { name: 'asc' },
        take: 2,
      });
      expect(page1.data).toHaveLength(2);
      expect((page1.data[0] as Record<string, unknown>).name).toBe('Alice');
      expect((page1.data[1] as Record<string, unknown>).name).toBe('Bob');

      // Second page — cursor from last result
      const lastNamePage1 = (page1.data[1] as Record<string, unknown>).name as string;
      const page2 = await db.list('users', {
        orderBy: { name: 'asc' },
        cursor: { name: lastNamePage1 },
        take: 2,
      });
      expect(page2.data).toHaveLength(2);
      expect((page2.data[0] as Record<string, unknown>).name).toBe('Carol');
      expect((page2.data[1] as Record<string, unknown>).name).toBe('Dave');

      // Third page — cursor from last result, should be empty
      const lastNamePage2 = (page2.data[1] as Record<string, unknown>).name as string;
      const page3 = await db.list('users', {
        orderBy: { name: 'asc' },
        cursor: { name: lastNamePage2 },
        take: 2,
      });
      expect(page3.data).toHaveLength(0);
    });

    it('supports cursor with where filters combined', async () => {
      await db.create('users', {
        data: { name: 'Alice', email: 'a@test.com', age: 20, active: true },
      });
      await db.create('users', {
        data: { name: 'Bob', email: 'b@test.com', age: 25, active: false },
      });
      await db.create('users', {
        data: { name: 'Carol', email: 'c@test.com', age: 30, active: true },
      });
      await db.create('users', {
        data: { name: 'Dave', email: 'd@test.com', age: 35, active: true },
      });

      // Cursor with where: only active users after Alice
      const result = await db.list('users', {
        where: { active: true },
        orderBy: { name: 'asc' },
        cursor: { name: 'Alice' },
        take: 10,
      });
      expect(result.data).toHaveLength(2);
      expect((result.data[0] as Record<string, unknown>).name).toBe('Carol');
      expect((result.data[1] as Record<string, unknown>).name).toBe('Dave');
    });

    it('supports cursor with desc ordering', async () => {
      await db.create('users', { data: { name: 'Alice', email: 'a@test.com', age: 20 } });
      await db.create('users', { data: { name: 'Bob', email: 'b@test.com', age: 25 } });
      await db.create('users', { data: { name: 'Carol', email: 'c@test.com', age: 30 } });

      // Desc ordering: start from Carol, go backwards
      const result = await db.list('users', {
        orderBy: { name: 'desc' },
        cursor: { name: 'Carol' },
        take: 10,
      });
      expect(result.data).toHaveLength(2);
      expect((result.data[0] as Record<string, unknown>).name).toBe('Bob');
      expect((result.data[1] as Record<string, unknown>).name).toBe('Alice');
    });
  });

  describe('listAndCount', () => {
    it('returns { data, total } in a single query', async () => {
      await db.create('users', { data: { name: 'Alice', email: 'a@test.com' } });
      await db.create('users', { data: { name: 'Bob', email: 'b@test.com' } });
      await db.create('users', { data: { name: 'Carol', email: 'c@test.com' } });

      const result = await db.listAndCount('users', {
        orderBy: { name: 'asc' },
        limit: 2,
      });
      expect(result.data.data).toHaveLength(2);
      expect(result.data.total).toBe(3);
      expect((result.data.data[0] as Record<string, unknown>).name).toBe('Alice');
    });

    it('returns { data: [], total: 0 } when no rows', async () => {
      const result = await db.listAndCount('users', {
        where: { name: 'Nobody' },
      });
      expect(result.data.data).toEqual([]);
      expect(result.data.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // create queries
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('inserts and returns the created row', async () => {
      const user = (await db.create('users', {
        data: { name: 'Alice', email: 'alice@test.com' },
      })) as Record<string, unknown>;

      expect(user.data.name).toBe('Alice');
      expect(user.data.email).toBe('alice@test.com');
      expect(user.data.id).toBeDefined();
      expect(user.data.active).toBe(true); // default
    });

    it('returns error Result on duplicate key', async () => {
      await db.create('users', { data: { name: 'Alice', email: 'alice@test.com' } });
      const result = await db.create('users', {
        data: { name: 'Alice2', email: 'alice@test.com' },
      });
      // Result now returns { ok: false, error: {...} }
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('CONSTRAINT_ERROR');
    });
  });

  describe('createMany', () => {
    it('batch inserts and returns { count }', async () => {
      const result = await db.createMany('users', {
        data: [
          { name: 'Alice', email: 'a@test.com' },
          { name: 'Bob', email: 'b@test.com' },
        ],
      });
      expect(result.data.count).toBe(2);

      const all = await db.list('users');
      expect(all.data).toHaveLength(2);
    });

    it('returns { count: 0 } for empty data array', async () => {
      const result = await db.createMany('users', { data: [] });
      expect(result.data.count).toBe(0);
    });
  });

  describe('createManyAndReturn', () => {
    it('batch inserts and returns all rows', async () => {
      const rows = await db.createManyAndReturn('users', {
        data: [
          { name: 'Alice', email: 'a@test.com' },
          { name: 'Bob', email: 'b@test.com' },
        ],
      });
      expect(rows.data).toHaveLength(2);
      const names = rows.data.map((r) => (r as Record<string, unknown>).name);
      expect(names).toContain('Alice');
      expect(names).toContain('Bob');
    });
  });

  // -------------------------------------------------------------------------
  // update queries
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('updates and returns the updated row', async () => {
      await db.create('users', { data: { name: 'Alice', email: 'alice@test.com', age: 30 } });

      const updated = (await db.update('users', {
        where: { email: 'alice@test.com' },
        data: { age: 31 },
      })) as Record<string, unknown>;

      expect(updated.data.age).toBe(31);
      expect(updated.data.name).toBe('Alice');
    });

    it('returns error Result when no rows match', async () => {
      const result = await db.update('users', {
        where: { email: 'nobody@test.com' },
        data: { age: 99 },
      });
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('QUERY_ERROR');
    });
  });

  describe('updateMany', () => {
    it('updates multiple rows and returns count', async () => {
      await db.create('users', { data: { name: 'Alice', email: 'a@test.com', active: true } });
      await db.create('users', { data: { name: 'Bob', email: 'b@test.com', active: true } });

      const result = await db.updateMany('users', {
        where: { active: true },
        data: { active: false },
      });
      expect(result.data.count).toBe(2);
    });

    it('returns error Result when where is an empty object to prevent accidental mass update', async () => {
      await db.create('users', { data: { name: 'Alice', email: 'a@test.com' } });

      const result = await db.updateMany('users', { where: {}, data: { name: 'Overwritten' } });
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('QUERY_ERROR');

      // Verify the row was NOT modified
      const alice = (await db.get('users', {
        where: { email: 'a@test.com' },
      })) as Record<string, unknown>;
      expect(alice.data.name).toBe('Alice');
    });
  });

  // -------------------------------------------------------------------------
  // upsert
  // -------------------------------------------------------------------------

  describe('upsert', () => {
    it('inserts when no existing row (ON CONFLICT)', async () => {
      const result = (await db.upsert('users', {
        where: { email: 'alice@test.com' },
        create: { name: 'Alice', email: 'alice@test.com', age: 30 },
        update: { name: 'Alice Updated' },
      })) as Record<string, unknown>;

      expect(result.data.name).toBe('Alice');
      expect(result.data.email).toBe('alice@test.com');
    });

    it('updates when existing row conflicts', async () => {
      await db.create('users', { data: { name: 'Alice', email: 'alice@test.com', age: 30 } });

      const result = (await db.upsert('users', {
        where: { email: 'alice@test.com' },
        create: { name: 'Alice', email: 'alice@test.com', age: 30 },
        update: { name: 'Alice Updated' },
      })) as Record<string, unknown>;

      expect(result.data.name).toBe('Alice Updated');
      expect(result.data.email).toBe('alice@test.com');
    });
  });

  // -------------------------------------------------------------------------
  // delete queries
  // -------------------------------------------------------------------------

  describe('delete', () => {
    it('deletes and returns the deleted row', async () => {
      await db.create('users', { data: { name: 'Alice', email: 'alice@test.com' } });

      const deleted = (await db.delete('users', {
        where: { email: 'alice@test.com' },
      })) as Record<string, unknown>;

      expect(deleted.data.name).toBe('Alice');

      const remaining = await db.list('users');
      expect(remaining.data).toHaveLength(0);
    });

    it('returns error Result when no rows match', async () => {
      const result = await db.delete('users', { where: { email: 'nobody@test.com' } });
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('QUERY_ERROR');
    });
  });

  describe('deleteMany', () => {
    it('deletes multiple rows and returns count', async () => {
      await db.create('users', { data: { name: 'Alice', email: 'a@test.com', active: true } });
      await db.create('users', { data: { name: 'Bob', email: 'b@test.com', active: true } });

      const result = await db.deleteMany('users', { where: { active: true } });
      expect(result.data.count).toBe(2);
    });

    it('returns error Result when where is an empty object to prevent accidental mass delete', async () => {
      await db.create('users', { data: { name: 'Alice', email: 'a@test.com' } });

      const result = await db.deleteMany('users', { where: {} });
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('QUERY_ERROR');

      // Verify the row was NOT deleted
      const all = await db.list('users');
      expect(all.data).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // select narrowing
  // -------------------------------------------------------------------------

  describe('select option', () => {
    it('narrows returned columns when select is provided', async () => {
      await db.create('users', { data: { name: 'Alice', email: 'alice@test.com', age: 30 } });

      const result = (await db.get('users', {
        where: { name: 'Alice' },
        select: { name: true, email: true },
      })) as Record<string, unknown>;

      expect(result.data.name).toBe('Alice');
      expect(result.data.email).toBe('alice@test.com');
      // Other columns should not be present since we only selected name + email
      expect(result.data.age).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // FK error
  // -------------------------------------------------------------------------

  describe('ForeignKeyError', () => {
    it('returns error Result on invalid FK reference', async () => {
      const result = await db.create('posts', {
        data: {
          title: 'Test Post',
          authorId: '00000000-0000-0000-0000-000000000000',
        },
      });
      // Result now returns { ok: false, error: {...} }
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('CONSTRAINT_ERROR');
    });
  });

  // -------------------------------------------------------------------------
  // Full CRUD cycle
  // -------------------------------------------------------------------------

  describe('integration: full CRUD cycle', () => {
    it('creates, finds, updates, and deletes a row', async () => {
      // Create
      const created = (await db.create('users', {
        data: { name: 'Alice', email: 'alice@test.com', age: 30 },
      })) as Record<string, unknown>;
      expect(created.data.id).toBeDefined();
      expect(created.data.name).toBe('Alice');

      // Find
      const found = (await db.get('users', {
        where: { id: created.data.id },
      })) as Record<string, unknown>;
      expect(found.data).not.toBeNull();
      expect(found.data.email).toBe('alice@test.com');

      // Update
      const updated = (await db.update('users', {
        where: { id: created.data.id },
        data: { age: 31, name: 'Alice Smith' },
      })) as Record<string, unknown>;
      expect(updated.data.age).toBe(31);
      expect(updated.data.name).toBe('Alice Smith');

      // Delete
      const deleted = (await db.delete('users', {
        where: { id: created.data.id },
      })) as Record<string, unknown>;
      expect(deleted.data.name).toBe('Alice Smith');

      // Verify deleted
      const notFound = await db.get('users', { where: { id: created.data.id } });
      expect(notFound.data).toBeNull();
    });
  });
});
