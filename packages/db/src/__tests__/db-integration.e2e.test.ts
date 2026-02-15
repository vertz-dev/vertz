import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '../client/database';
import { createDbProvider } from '../core/db-provider';
import { d } from '../d';
import type { QueryFn } from '../query/executor';
import { tableToSchemas } from '../schema-derive/table-to-schemas';

// ---------------------------------------------------------------------------
// Schema: a realistic table with various column types and metadata
// ---------------------------------------------------------------------------

const users = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  email: d.email().unique(),
  passwordHash: d.varchar(255).hidden(),
  role: d.enum('user_role', ['admin', 'member']).default('member'),
  bio: d.text().nullable(),
  createdAt: d.timestamp().default('now'),
});

const tables = {
  users: { table: users, relations: {} },
};

// ---------------------------------------------------------------------------
// PGlite setup — in-process Postgres for fast testing
// ---------------------------------------------------------------------------

let pg: PGlite;
let queryFn: QueryFn;

beforeAll(async () => {
  pg = new PGlite();
  queryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
    const result = await pg.query(sqlStr, params as unknown[]);
    return {
      rows: result.rows as readonly T[],
      rowCount: result.affectedRows ?? result.rows.length,
    };
  };

  // Create the enum and table in PGlite
  await pg.exec(`
    CREATE TYPE user_role AS ENUM ('admin', 'member');
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role user_role NOT NULL DEFAULT 'member',
      bio TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
});

afterAll(async () => {
  await pg.close();
});

// ---------------------------------------------------------------------------
// Integration: both APIs work together on the same table definition
// ---------------------------------------------------------------------------

describe('db-integration e2e', () => {
  // Derive schemas from the table definition
  const userSchemas = tableToSchemas(users);

  // -----------------------------------------------------------------------
  // Schema derivation produces correct shapes
  // -----------------------------------------------------------------------

  it('createBody excludes PK and defaulted columns', () => {
    const shape = userSchemas.createBody.shape;
    expect(shape).toHaveProperty('name');
    expect(shape).toHaveProperty('email');
    expect(shape).toHaveProperty('passwordHash');
    expect(shape).toHaveProperty('bio');
    expect(shape).not.toHaveProperty('id');
    expect(shape).not.toHaveProperty('role');
    expect(shape).not.toHaveProperty('createdAt');
  });

  it('updateBody includes all non-PK, all optional', () => {
    const result = userSchemas.updateBody.safeParse({});
    expect(result.success).toBe(true);
    expect(userSchemas.updateBody.shape).not.toHaveProperty('id');
    expect(userSchemas.updateBody.shape).toHaveProperty('name');
    expect(userSchemas.updateBody.shape).toHaveProperty('role');
  });

  it('responseSchema excludes hidden columns', () => {
    const shape = userSchemas.responseSchema.shape;
    expect(shape).not.toHaveProperty('passwordHash');
    expect(shape).toHaveProperty('id');
    expect(shape).toHaveProperty('name');
    expect(shape).toHaveProperty('email');
    expect(shape).toHaveProperty('role');
    expect(shape).toHaveProperty('bio');
    expect(shape).toHaveProperty('createdAt');
  });

  // -----------------------------------------------------------------------
  // Derived schemas validate data correctly
  // -----------------------------------------------------------------------

  it('validates create payload with correct types', () => {
    const valid = userSchemas.createBody.safeParse({
      name: 'Alice',
      email: 'alice@example.com',
      passwordHash: 'hashed-password',
      bio: null,
    });
    expect(valid.success).toBe(true);
  });

  it('rejects invalid email in create payload', () => {
    const invalid = userSchemas.createBody.safeParse({
      name: 'Alice',
      email: 'not-an-email',
      passwordHash: 'hash',
      bio: null,
    });
    expect(invalid.success).toBe(false);
  });

  it('validates enum values in update payload', () => {
    expect(userSchemas.updateBody.safeParse({ role: 'admin' }).success).toBe(true);
    expect(userSchemas.updateBody.safeParse({ role: 'superadmin' }).success).toBe(false);
  });

  // -----------------------------------------------------------------------
  // DB queries + schema validation round-trip
  // -----------------------------------------------------------------------

  it('creates a user, reads it back, validates against derived schema', async () => {
    const db = createDb({
      url: 'postgres://localhost:5432/test',
      tables,
      casing: 'snake_case',
      _queryFn: queryFn,
    });

    // Create a user
    const created = await db.create('users', {
      data: {
        name: 'Bob',
        email: 'bob@test.com',
        passwordHash: 'secret-hash',
        bio: 'Hello world',
      },
    });
    expect(created.name).toBe('Bob');
    expect(created.email).toBe('bob@test.com');

    // Read back
    const found = await db.list('users', {
      where: { email: 'bob@test.com' },
    });
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe('Bob');

    // Validate the query result against the derived response schema
    const parseResult = userSchemas.responseSchema.safeParse(found[0]);
    expect(parseResult.success).toBe(true);

    await db.close();
  });

  // -----------------------------------------------------------------------
  // createDbProvider returns ServiceDef-compatible shape
  // -----------------------------------------------------------------------

  it('createDbProvider + tableToSchemas share the same table definition', () => {
    const provider = createDbProvider({
      url: 'postgres://localhost:5432/test',
      tables,
      _queryFn: queryFn,
    });

    // Provider has the correct lifecycle hooks
    expect(typeof provider.onInit).toBe('function');
    expect(typeof provider.methods).toBe('function');
    expect(typeof provider.onDestroy).toBe('function');

    // Schemas were derived from the same table
    expect(userSchemas.createBody.shape).toHaveProperty('name');
    expect(userSchemas.responseSchema.shape).not.toHaveProperty('passwordHash');
  });

  it('provider lifecycle: init → methods → destroy', async () => {
    const provider = createDbProvider({
      url: 'postgres://localhost:5432/test',
      tables,
      _queryFn: queryFn,
    });

    // Init
    const db = await provider.onInit({});
    expect(db).toBeDefined();

    // Methods returns db directly
    const methods = provider.methods({}, db);
    expect(methods).toBe(db);

    // Can query
    const allUsers = await db.list('users');
    expect(allUsers.length).toBeGreaterThan(0);

    // Validate result with derived schema
    for (const user of allUsers) {
      const result = userSchemas.responseSchema.safeParse(user);
      expect(result.success).toBe(true);
    }

    // Destroy
    await provider.onDestroy({}, db);
  });
});
