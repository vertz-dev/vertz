/**
 * Regression tests for #2890 — SQLite rowCount on write-without-RETURNING.
 *
 * Writes that don't carry a RETURNING clause (createMany / updateMany /
 * deleteMany) must still surface an accurate `count`. Before the fix, the
 * SQLite queryFn wrapper routed every statement through `driver.query()`
 * (`stmt.all()`), which returns an empty result set for write statements,
 * so `{ rows, rowCount: rows.length }` collapsed to `rowCount: 0`.
 */

import { describe, expect, it, mock } from '@vertz/test';
import { createDb, isWriteWithoutReturning } from '../database';
import type { D1Database, D1PreparedStatement } from '../sqlite-driver';
import { d } from '../../d';

// ---------------------------------------------------------------------------
// Local SQLite (real driver via :memory:) — the repro from the issue
// ---------------------------------------------------------------------------

describe('Feature: SQLite rowCount for write-without-RETURNING (#2890)', () => {
  describe('Given a local :memory: SQLite database', () => {
    describe('When createMany inserts N rows without RETURNING', () => {
      it('Then returns { count: N } matching rows actually persisted', async () => {
        const plain = d.table('plain', {
          id: d.uuid().primary({ generate: 'cuid' }),
          name: d.text(),
        });
        const db = createDb({
          dialect: 'sqlite',
          path: ':memory:',
          models: { plain: d.model(plain) },
          migrations: { autoApply: true },
        });

        const res = await db.plain.createMany({
          data: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
        });

        expect(res.ok).toBe(true);
        if (!res.ok) throw new TypeError('createMany failed');
        expect(res.data.count).toBe(3);

        const listed = await db.plain.list({});
        if (!listed.ok) throw new TypeError('list failed');
        expect(listed.data).toHaveLength(3);
      });
    });

    describe('When updateMany matches N rows without RETURNING', () => {
      it('Then returns { count: N } matching the rows actually updated', async () => {
        const plain = d.table('plain', {
          id: d.uuid().primary({ generate: 'cuid' }),
          name: d.text(),
          status: d.text().default('draft'),
        });
        const db = createDb({
          dialect: 'sqlite',
          path: ':memory:',
          models: { plain: d.model(plain) },
          migrations: { autoApply: true },
        });

        await db.plain.createMany({
          data: [
            { name: 'a', status: 'draft' },
            { name: 'b', status: 'draft' },
            { name: 'c', status: 'published' },
          ],
        });

        const res = await db.plain.updateMany({
          where: { status: 'draft' },
          data: { status: 'archived' },
        });

        expect(res.ok).toBe(true);
        if (!res.ok) throw new TypeError('updateMany failed');
        expect(res.data.count).toBe(2);
      });
    });

    describe('When deleteMany matches N rows without RETURNING', () => {
      it('Then returns { count: N } matching the rows actually deleted', async () => {
        const plain = d.table('plain', {
          id: d.uuid().primary({ generate: 'cuid' }),
          name: d.text(),
          status: d.text().default('draft'),
        });
        const db = createDb({
          dialect: 'sqlite',
          path: ':memory:',
          models: { plain: d.model(plain) },
          migrations: { autoApply: true },
        });

        await db.plain.createMany({
          data: [
            { name: 'a', status: 'draft' },
            { name: 'b', status: 'draft' },
            { name: 'c', status: 'published' },
          ],
        });

        const res = await db.plain.deleteMany({ where: { status: 'draft' } });

        expect(res.ok).toBe(true);
        if (!res.ok) throw new TypeError('deleteMany failed');
        expect(res.data.count).toBe(2);

        const remaining = await db.plain.list({});
        if (!remaining.ok) throw new TypeError('list failed');
        expect(remaining.data).toHaveLength(1);
      });
    });

    describe('When createManyAndReturn inserts with RETURNING *', () => {
      it('Then still returns all inserted rows (RETURNING path unchanged)', async () => {
        const plain = d.table('plain', {
          id: d.uuid().primary({ generate: 'cuid' }),
          name: d.text(),
        });
        const db = createDb({
          dialect: 'sqlite',
          path: ':memory:',
          models: { plain: d.model(plain) },
          migrations: { autoApply: true },
        });

        const res = await db.plain.createManyAndReturn({
          data: [{ name: 'a' }, { name: 'b' }],
        });

        expect(res.ok).toBe(true);
        if (!res.ok) throw new TypeError('createManyAndReturn failed');
        expect(res.data).toHaveLength(2);
        expect(res.data.map((r) => r.name).sort()).toEqual(['a', 'b']);
      });
    });
  });

  // -------------------------------------------------------------------------
  // D1 binding — writes without RETURNING must call run(), not all()
  // -------------------------------------------------------------------------

  describe('Given a D1 binding', () => {
    describe('When createMany issues an INSERT without RETURNING', () => {
      it('Then the driver invokes run() (not all()) and surfaces meta.changes as count', async () => {
        const allCalls: string[] = [];
        const runCalls: string[] = [];
        let lastSql = '';

        const mockD1: D1Database = {
          prepare: (sql: string) => {
            lastSql = sql;
            const stmt: D1PreparedStatement = {
              bind(this: D1PreparedStatement) {
                return this;
              },
              all: mock(async () => {
                allCalls.push(lastSql);
                return { results: [] };
              }),
              run: mock(async () => {
                runCalls.push(lastSql);
                return { meta: { changes: 3 } };
              }),
            };
            return stmt;
          },
        } as unknown as D1Database;

        const plain = d.table('plain', {
          id: d.uuid().primary({ generate: 'cuid' }),
          name: d.text(),
        });

        const db = createDb({
          dialect: 'sqlite',
          d1: mockD1,
          models: { plain: d.model(plain) },
        });

        const res = await db.plain.createMany({
          data: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
        });

        expect(res.ok).toBe(true);
        if (!res.ok) throw new TypeError('createMany failed');
        expect(res.data.count).toBe(3);

        // The INSERT without RETURNING must go through run(), not all()
        const writeSqlAll = allCalls.filter((s) => /^INSERT\s/i.test(s));
        const writeSqlRun = runCalls.filter((s) => /^INSERT\s/i.test(s));
        expect(writeSqlAll).toHaveLength(0);
        expect(writeSqlRun.length).toBeGreaterThan(0);
      });
    });
  });

  // -------------------------------------------------------------------------
  // isWriteWithoutReturning helper — unit tests
  // -------------------------------------------------------------------------

  describe('isWriteWithoutReturning helper', () => {
    it('returns true for plain INSERT / UPDATE / DELETE', () => {
      expect(isWriteWithoutReturning('INSERT INTO t (a) VALUES (1)')).toBe(true);
      expect(isWriteWithoutReturning('UPDATE t SET a = 1')).toBe(true);
      expect(isWriteWithoutReturning('DELETE FROM t WHERE id = 1')).toBe(true);
    });

    it('returns false for writes that include a RETURNING clause', () => {
      expect(isWriteWithoutReturning('INSERT INTO t (a) VALUES (1) RETURNING *')).toBe(false);
      expect(isWriteWithoutReturning('UPDATE t SET a = 1 RETURNING id')).toBe(false);
      expect(isWriteWithoutReturning('DELETE FROM t WHERE id = 1 RETURNING id')).toBe(false);
      expect(isWriteWithoutReturning('insert into t (a) values (1) returning id')).toBe(false);
    });

    it('returns false for SELECT and DDL statements', () => {
      expect(isWriteWithoutReturning('SELECT 1')).toBe(false);
      expect(isWriteWithoutReturning('CREATE TABLE t (id INTEGER)')).toBe(false);
      expect(isWriteWithoutReturning('DROP TABLE t')).toBe(false);
      expect(isWriteWithoutReturning('PRAGMA foreign_keys = ON')).toBe(false);
    });

    it('strips leading comments before checking the verb', () => {
      expect(isWriteWithoutReturning('-- a comment\nINSERT INTO t (a) VALUES (1)')).toBe(true);
      expect(isWriteWithoutReturning('/* block comment */ UPDATE t SET a = 1 RETURNING id')).toBe(
        false,
      );
    });

    it('ignores the literal word RETURNING when it appears inside a quoted string', () => {
      expect(
        isWriteWithoutReturning("INSERT INTO t (note) VALUES ('RETURNING is just text')"),
      ).toBe(true);
    });

    it('ignores RETURNING inside trailing line or block comments', () => {
      // Trailing line comment — real statement has no RETURNING
      expect(isWriteWithoutReturning('INSERT INTO t VALUES (1) -- RETURNING is fake')).toBe(true);
      // Mid-statement block comment — real statement has no RETURNING
      expect(isWriteWithoutReturning('UPDATE t SET a = 1 /* RETURNING x */')).toBe(true);
      // Block comment before the verb — real RETURNING still present
      expect(
        isWriteWithoutReturning('/* note: RETURNING is inline */ UPDATE t SET a = 1 RETURNING id'),
      ).toBe(false);
    });

    it('recognises REPLACE INTO (SQLite write verb) without RETURNING', () => {
      expect(isWriteWithoutReturning('REPLACE INTO t (id, a) VALUES (1, 2)')).toBe(true);
      expect(isWriteWithoutReturning('replace into t (id, a) values (1, 2) returning id')).toBe(
        false,
      );
    });

    it('does not classify writable CTEs as write-without-RETURNING (outer wrapper is SELECT)', () => {
      expect(
        isWriteWithoutReturning(
          'WITH cte AS (INSERT INTO t VALUES (1) RETURNING id) SELECT * FROM cte',
        ),
      ).toBe(false);
      expect(
        isWriteWithoutReturning('with cte as (insert into t values (1)) select * from cte'),
      ).toBe(false);
      expect(
        isWriteWithoutReturning('WITH cte AS (DELETE FROM t WHERE id = 1) SELECT * FROM cte'),
      ).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Transactions — the new routing must also apply inside db.transaction()
  // -------------------------------------------------------------------------

  describe('Given a local :memory: SQLite database inside a transaction', () => {
    describe('When createMany / updateMany run via tx delegates', () => {
      it('Then each call surfaces accurate { count } and the writes commit', async () => {
        const plain = d.table('plain', {
          id: d.uuid().primary({ generate: 'cuid' }),
          name: d.text(),
          status: d.text().default('draft'),
        });
        const db = createDb({
          dialect: 'sqlite',
          path: ':memory:',
          models: { plain: d.model(plain) },
          migrations: { autoApply: true },
        });

        const result = await db.transaction(async (tx) => {
          const created = await tx.plain.createMany({
            data: [
              { name: 'a', status: 'draft' },
              { name: 'b', status: 'draft' },
              { name: 'c', status: 'published' },
            ],
          });
          if (!created.ok) throw new TypeError('createMany failed');
          const updated = await tx.plain.updateMany({
            where: { status: 'draft' },
            data: { status: 'archived' },
          });
          if (!updated.ok) throw new TypeError('updateMany failed');
          return { createdCount: created.data.count, updatedCount: updated.data.count };
        });

        expect(result.createdCount).toBe(3);
        expect(result.updatedCount).toBe(2);

        const listed = await db.plain.list({});
        if (!listed.ok) throw new TypeError('list failed');
        expect(listed.data).toHaveLength(3);
      });
    });
  });
});
