import { describe, expect, it } from 'vitest';
import { defaultPostgresDialect, SqliteDialect } from '../../dialect';
import { buildDelete } from '../delete';
import { buildInsert } from '../insert';
import { buildSelect } from '../select';
import { buildUpdate } from '../update';
import { buildWhere } from '../where';

const sqliteDialect = new SqliteDialect();

describe('buildInsert with SqliteDialect', () => {
  it('generates ? params for single insert', () => {
    const result = buildInsert(
      {
        table: 'users',
        data: { id: '123', name: 'Alice' },
        returning: '*',
      },
      sqliteDialect,
    );

    expect(result.sql).toBe('INSERT INTO "users" ("id", "name") VALUES (?, ?) RETURNING *');
    expect(result.params).toEqual(['123', 'Alice']);
  });

  it('generates datetime("now") for NOW() sentinel', () => {
    const result = buildInsert(
      {
        table: 'users',
        data: { id: '123', createdAt: 'now' },
        returning: '*',
        nowColumns: ['createdAt'],
      },
      sqliteDialect,
    );

    expect(result.sql).toBe('INSERT INTO "users" ("id", "created_at") VALUES (?, datetime(\'now\')) RETURNING *');
    expect(result.params).toEqual(['123']);
  });

  it('generates ? params for ON CONFLICT DO UPDATE', () => {
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
      sqliteDialect,
    );

    expect(result.sql).toBe(
      'INSERT INTO "users" ("id", "name") VALUES (?, ?) ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name" RETURNING *',
    );
    expect(result.params).toEqual(['123', 'Alice']);
  });
});

describe('buildSelect with SqliteDialect', () => {
  it('generates ? params for select', () => {
    const result = buildSelect(
      {
        table: 'users',
        columns: ['id', 'name'],
        where: { id: { eq: '123' } },
        orderBy: { name: 'asc' },
        limit: 10,
      },
      sqliteDialect,
    );

    expect(result.sql).toBe(
      'SELECT "id", "name" FROM "users" WHERE "id" = ? ORDER BY "name" ASC LIMIT ?',
    );
    expect(result.params).toEqual(['123', 10]);
  });

  it('generates ? params for IN operator', () => {
    const result = buildSelect(
      {
        table: 'users',
        where: { status: { in: ['active', 'pending'] } },
      },
      sqliteDialect,
    );

    expect(result.sql).toBe('SELECT * FROM "users" WHERE "status" IN (?, ?)');
    expect(result.params).toEqual(['active', 'pending']);
  });
});

describe('buildUpdate with SqliteDialect', () => {
  it('generates ? params for update', () => {
    const result = buildUpdate(
      {
        table: 'users',
        data: { name: 'Bob' },
        where: { id: { eq: '123' } },
        returning: '*',
      },
      sqliteDialect,
    );

    expect(result.sql).toBe('UPDATE "users" SET "name" = ? WHERE "id" = ? RETURNING *');
    expect(result.params).toEqual(['Bob', '123']);
  });

  it('generates datetime("now") for NOW() sentinel', () => {
    const result = buildUpdate(
      {
        table: 'users',
        data: { updatedAt: 'now' },
        where: { id: { eq: '123' } },
        returning: '*',
        nowColumns: ['updatedAt'],
      },
      sqliteDialect,
    );

    expect(result.sql).toBe('UPDATE "users" SET "updated_at" = datetime(\'now\') WHERE "id" = ? RETURNING *');
    expect(result.params).toEqual(['123']);
  });
});

describe('buildDelete with SqliteDialect', () => {
  it('generates ? params for delete', () => {
    const result = buildDelete(
      {
        table: 'users',
        where: { id: { eq: '123' } },
        returning: '*',
      },
      sqliteDialect,
    );

    expect(result.sql).toBe('DELETE FROM "users" WHERE "id" = ? RETURNING *');
    expect(result.params).toEqual(['123']);
  });
});

describe('buildWhere with SqliteDialect', () => {
  it('generates ? params for standard operators', () => {
    const result = buildWhere(
      {
        age: { gt: 18, lte: 65 },
        name: { contains: 'alice' },
        status: { in: ['active', 'pending'] },
      },
      0,
      undefined,
      sqliteDialect,
    );

    expect(result.sql).toBe(
      '"age" > ? AND "age" <= ? AND "name" LIKE ? AND "status" IN (?, ?)',
    );
    expect(result.params).toEqual([18, 65, '%alice%', 'active', 'pending']);
  });

  it('generates ? params for OR/AND/NOT', () => {
    const result = buildWhere(
      {
        OR: [{ name: { eq: 'Alice' } }, { name: { eq: 'Bob' } }],
      },
      0,
      undefined,
      sqliteDialect,
    );

    expect(result.sql).toBe('("name" = ? OR "name" = ?)');
    expect(result.params).toEqual(['Alice', 'Bob']);
  });
});

describe('SQLite feature guards', () => {
  it('throws descriptive error for arrayContains with SqliteDialect', () => {
    expect(() =>
      buildWhere(
        { tags: { arrayContains: ['admin'] } },
        0,
        undefined,
        sqliteDialect,
      ),
    ).toThrow('Array operators (arrayContains, arrayContainedBy, arrayOverlaps) are not supported on SQLite');
  });

  it('throws descriptive error for arrayContainedBy with SqliteDialect', () => {
    expect(() =>
      buildWhere(
        { tags: { arrayContainedBy: ['admin'] } },
        0,
        undefined,
        sqliteDialect,
      ),
    ).toThrow('Array operators (arrayContains, arrayContainedBy, arrayOverlaps) are not supported on SQLite');
  });

  it('throws descriptive error for arrayOverlaps with SqliteDialect', () => {
    expect(() =>
      buildWhere(
        { tags: { arrayOverlaps: ['admin'] } },
        0,
        undefined,
        sqliteDialect,
      ),
    ).toThrow('Array operators (arrayContains, arrayContainedBy, arrayOverlaps) are not supported on SQLite');
  });

  it('throws descriptive error for JSONB path operator with SqliteDialect', () => {
    expect(() =>
      buildWhere(
        { 'metadata->role': { eq: 'admin' } },
        0,
        undefined,
        sqliteDialect,
      ),
    ).toThrow('JSONB path operators (->>, ->) are not supported on SQLite');
  });

  it('array operators work with PostgresDialect', () => {
    const result = buildWhere(
      { tags: { arrayContains: ['admin'] } },
      0,
      undefined,
      defaultPostgresDialect,
    );

    expect(result.sql).toBe('"tags" @> $1');
    expect(result.params).toEqual([['admin']]);
  });

  it('JSONB path operators work with PostgresDialect', () => {
    const result = buildWhere(
      { 'metadata->role': { eq: 'admin' } },
      0,
      undefined,
      defaultPostgresDialect,
    );

    expect(result.sql).toBe('"metadata"->>\'role\' = $1');
    expect(result.params).toEqual(['admin']);
  });
});
