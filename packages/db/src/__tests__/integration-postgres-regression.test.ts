/**
 * Regression tests for Postgres dialect.
 *
 * These tests verify that the Postgres dialect continues to work exactly as before
 * using PGlite (in-memory Postgres). They serve as a regression suite to ensure
 * no breaking changes were introduced during SQLite dialect implementation.
 */

import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { createDb } from '../client/database';
import { d } from '../d';

// ---------------------------------------------------------------------------
// Schema definition
// ---------------------------------------------------------------------------

const users = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  active: d.boolean().default(true),
  createdAt: d.timestamp().default('now'),
});

const models = { users: d.model(users) };

describe('Postgres regression: create and list users via PGlite', () => {
  it('creates and lists users with default dialect (Postgres)', async () => {
    // Create in-memory PGlite instance
    const pg = new PGlite();

    // Set up the schema
    await pg.exec(`
      CREATE TABLE users (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Define query function that uses PGlite
    const queryFn = async (sql: string, params: readonly unknown[]) => {
      const result = await pg.query(sql, params as never[]);
      return { rows: result.rows, rowCount: result.rows.length };
    };

    // Create the database with PGlite query function
    const db = createDb({
      url: 'pglite://memory',
      models,
      _queryFn: queryFn,
    });

    // Create a user
    const createResult = await db.create('users', {
      data: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Alice',
        active: true,
        createdAt: 'now',
      },
    });

    expect(createResult.ok).toBe(true);

    // List users
    const listResult = await db.list('users');

    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.data).toHaveLength(1);
      expect(listResult.data[0].name).toBe('Alice');
      expect(listResult.data[0].active).toBe(true);
    }

    // Clean up
    await pg.close();
  });
});
