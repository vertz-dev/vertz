import { describe, expect, it } from 'bun:test';
import { defaultPostgresDialect } from '../../dialect';
import { buildDelete } from '../delete';
import { buildInsert } from '../insert';
import { buildSelect } from '../select';
import { buildUpdate } from '../update';
import { buildWhere } from '../where';

/**
 * Regression tests: PostgresDialect produces identical SQL as before refactor.
 */

describe('buildInsert with PostgresDialect (regression)', () => {
  it('produces same SQL as before for single insert', () => {
    const result = buildInsert(
      {
        table: 'users',
        data: { id: '123', name: 'Alice' },
        returning: '*',
      },
      defaultPostgresDialect,
    );

    expect(result.sql).toBe('INSERT INTO "users" ("id", "name") VALUES ($1, $2) RETURNING *');
    expect(result.params).toEqual(['123', 'Alice']);
  });

  it('produces same SQL for NOW() sentinel', () => {
    const result = buildInsert(
      {
        table: 'users',
        data: { id: '123', createdAt: 'now' },
        returning: '*',
        nowColumns: ['createdAt'],
      },
      defaultPostgresDialect,
    );

    expect(result.sql).toBe('INSERT INTO "users" ("id", "created_at") VALUES ($1, NOW()) RETURNING *');
    expect(result.params).toEqual(['123']);
  });

  it('produces same SQL for ON CONFLICT DO UPDATE', () => {
    const result = buildInsert(
      {
        table: 'users',
        data: { id: '123', name: 'Alice' },
        returning: '*',
        onConflict: {
          columns: ['id'],
          action: 'update',
          updateColumns: ['name'],
        },
      },
      defaultPostgresDialect,
    );

    expect(result.sql).toBe(
      'INSERT INTO "users" ("id", "name") VALUES ($1, $2) ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name" RETURNING *',
    );
    expect(result.params).toEqual(['123', 'Alice']);
  });
});

describe('buildSelect with PostgresDialect (regression)', () => {
  it('produces same SQL as before', () => {
    const result = buildSelect(
      {
        table: 'users',
        columns: ['id', 'name'],
        where: { id: { eq: '123' } },
        orderBy: { name: 'asc' },
        limit: 10,
      },
      defaultPostgresDialect,
    );

    expect(result.sql).toBe(
      'SELECT "id", "name" FROM "users" WHERE "id" = $1 ORDER BY "name" ASC LIMIT $2',
    );
    expect(result.params).toEqual(['123', 10]);
  });

  it('produces same SQL for IN operator', () => {
    const result = buildSelect(
      {
        table: 'users',
        where: { status: { in: ['active', 'pending'] } },
      },
      defaultPostgresDialect,
    );

    expect(result.sql).toBe('SELECT * FROM "users" WHERE "status" IN ($1, $2)');
    expect(result.params).toEqual(['active', 'pending']);
  });
});

describe('buildUpdate with PostgresDialect (regression)', () => {
  it('produces same SQL as before', () => {
    const result = buildUpdate(
      {
        table: 'users',
        data: { name: 'Bob' },
        where: { id: { eq: '123' } },
        returning: '*',
      },
      defaultPostgresDialect,
    );

    expect(result.sql).toBe('UPDATE "users" SET "name" = $1 WHERE "id" = $2 RETURNING *');
    expect(result.params).toEqual(['Bob', '123']);
  });

  it('produces same SQL for NOW() sentinel', () => {
    const result = buildUpdate(
      {
        table: 'users',
        data: { updatedAt: 'now' },
        where: { id: { eq: '123' } },
        returning: '*',
        nowColumns: ['updatedAt'],
      },
      defaultPostgresDialect,
    );

    expect(result.sql).toBe('UPDATE "users" SET "updated_at" = NOW() WHERE "id" = $1 RETURNING *');
    expect(result.params).toEqual(['123']);
  });
});

describe('buildDelete with PostgresDialect (regression)', () => {
  it('produces same SQL as before', () => {
    const result = buildDelete(
      {
        table: 'users',
        where: { id: { eq: '123' } },
        returning: '*',
      },
      defaultPostgresDialect,
    );

    expect(result.sql).toBe('DELETE FROM "users" WHERE "id" = $1 RETURNING *');
    expect(result.params).toEqual(['123']);
  });
});

describe('buildWhere with PostgresDialect (regression)', () => {
  it('produces same SQL for all standard operators', () => {
    const result = buildWhere(
      {
        age: { gt: 18, lte: 65 },
        name: { contains: 'alice' },
        status: { in: ['active', 'pending'] },
      },
      0,
      undefined,
      defaultPostgresDialect,
    );

    expect(result.sql).toBe(
      '"age" > $1 AND "age" <= $2 AND "name" LIKE $3 AND "status" IN ($4, $5)',
    );
    expect(result.params).toEqual([18, 65, '%alice%', 'active', 'pending']);
  });

  it('produces same SQL for OR/AND/NOT', () => {
    const result = buildWhere(
      {
        OR: [{ name: { eq: 'Alice' } }, { name: { eq: 'Bob' } }],
      },
      0,
      undefined,
      defaultPostgresDialect,
    );

    expect(result.sql).toBe('("name" = $1 OR "name" = $2)');
    expect(result.params).toEqual(['Alice', 'Bob']);
  });
});
