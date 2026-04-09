/**
 * Tests for groupBy() with GroupByExpression support.
 *
 * Uses a mock queryFn to verify SQL generation and result mapping
 * without requiring PGlite.
 */
import { describe, expect, it } from '@vertz/test';
import { d } from '../../d';
import { groupBy } from '../aggregate';
import type { QueryFn } from '../executor';
import { fnDate, fnDateTrunc, fnExtract } from '../expression';

const clicksTable = d.table('clicks', {
  id: d.uuid().primary().default('gen_random_uuid()'),
  urlId: d.text(),
  clickedAt: d.timestamp(),
});

/** Creates a mock queryFn that captures the SQL and returns given rows. */
function mockQueryFn(
  rows: Record<string, unknown>[] = [],
): QueryFn & { lastSql: string; lastParams: unknown[] } {
  const fn = (async <T>(sql: string, params: readonly unknown[]) => {
    fn.lastSql = sql;
    fn.lastParams = [...params];
    return { rows: rows as readonly T[], rowCount: rows.length };
  }) as QueryFn & { lastSql: string; lastParams: unknown[] };
  fn.lastSql = '';
  fn.lastParams = [];
  return fn;
}

describe('groupBy with GroupByExpression', () => {
  // -------------------------------------------------------------------------
  // d.fn.date()
  // -------------------------------------------------------------------------

  it('generates correct SQL for d.fn.date() expression', async () => {
    const qfn = mockQueryFn([{ dateClickedAt: '2024-01-15', _count: 3 }]);

    await groupBy(qfn, clicksTable, {
      by: [fnDate('clickedAt')],
      _count: true,
    });

    expect(qfn.lastSql).toContain('DATE("clicked_at") AS "dateClickedAt"');
    expect(qfn.lastSql).toContain('GROUP BY DATE("clicked_at")');
    expect(qfn.lastSql).toContain('COUNT(*) AS "_count"');
  });

  it('maps expression result rows correctly', async () => {
    const qfn = mockQueryFn([
      { dateClickedAt: '2024-01-15', _count: '3' },
      { dateClickedAt: '2024-02-20', _count: '2' },
    ]);

    const result = await groupBy(qfn, clicksTable, {
      by: [fnDate('clickedAt')],
      _count: true,
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.dateClickedAt).toBe('2024-01-15');
    expect(result[0]?._count).toBe(3);
    expect(result[1]?.dateClickedAt).toBe('2024-02-20');
    expect(result[1]?._count).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Mixed columns and expressions
  // -------------------------------------------------------------------------

  it('generates correct SQL for mix of column and expression', async () => {
    const qfn = mockQueryFn([]);

    await groupBy(qfn, clicksTable, {
      by: ['urlId', fnDate('clickedAt')],
      _count: true,
    });

    expect(qfn.lastSql).toContain('"url_id" AS "urlId"');
    expect(qfn.lastSql).toContain('DATE("clicked_at") AS "dateClickedAt"');
    expect(qfn.lastSql).toContain('GROUP BY "url_id", DATE("clicked_at")');
  });

  it('maps mixed column and expression result rows', async () => {
    const qfn = mockQueryFn([{ urlId: 'url-1', dateClickedAt: '2024-01-15', _count: '2' }]);

    const result = await groupBy(qfn, clicksTable, {
      by: ['urlId', fnDate('clickedAt')],
      _count: true,
    });

    expect(result[0]?.urlId).toBe('url-1');
    expect(result[0]?.dateClickedAt).toBe('2024-01-15');
    expect(result[0]?._count).toBe(2);
  });

  // -------------------------------------------------------------------------
  // d.fn.dateTrunc()
  // -------------------------------------------------------------------------

  it('generates correct SQL for d.fn.dateTrunc() expression', async () => {
    const qfn = mockQueryFn([]);

    await groupBy(qfn, clicksTable, {
      by: [fnDateTrunc('month', 'clickedAt')],
      _count: true,
    });

    expect(qfn.lastSql).toContain(
      'date_trunc(\'month\', "clicked_at") AS "dateTruncMonthClickedAt"',
    );
    expect(qfn.lastSql).toContain('GROUP BY date_trunc(\'month\', "clicked_at")');
  });

  // -------------------------------------------------------------------------
  // d.fn.extract()
  // -------------------------------------------------------------------------

  it('generates correct SQL for d.fn.extract() expression', async () => {
    const qfn = mockQueryFn([]);

    await groupBy(qfn, clicksTable, {
      by: [fnExtract('month', 'clickedAt')],
      _count: true,
    });

    expect(qfn.lastSql).toContain('EXTRACT(month FROM "clicked_at") AS "extractMonthClickedAt"');
    expect(qfn.lastSql).toContain('GROUP BY EXTRACT(month FROM "clicked_at")');
  });

  // -------------------------------------------------------------------------
  // orderBy with expression aliases
  // -------------------------------------------------------------------------

  it('generates correct ORDER BY for expression alias', async () => {
    const qfn = mockQueryFn([]);

    await groupBy(qfn, clicksTable, {
      by: [fnDate('clickedAt')],
      _count: true,
      orderBy: { dateClickedAt: 'desc' },
    });

    expect(qfn.lastSql).toContain('ORDER BY DATE("clicked_at") DESC');
  });

  it('generates correct ORDER BY for dateTrunc expression alias', async () => {
    const qfn = mockQueryFn([]);

    await groupBy(qfn, clicksTable, {
      by: [fnDateTrunc('hour', 'clickedAt')],
      _count: true,
      orderBy: { dateTruncHourClickedAt: 'asc' },
    });

    expect(qfn.lastSql).toContain('ORDER BY date_trunc(\'hour\', "clicked_at") ASC');
  });

  it('supports orderBy mixing expression alias and _count', async () => {
    const qfn = mockQueryFn([]);

    await groupBy(qfn, clicksTable, {
      by: [fnDate('clickedAt')],
      _count: true,
      orderBy: { _count: 'asc', dateClickedAt: 'desc' },
    });

    expect(qfn.lastSql).toContain('ORDER BY COUNT(*) ASC, DATE("clicked_at") DESC');
  });

  it('falls through to column name path for unknown orderBy keys', async () => {
    const qfn = mockQueryFn([]);

    await groupBy(qfn, clicksTable, {
      by: ['urlId', fnDate('clickedAt')],
      _count: true,
      orderBy: { urlId: 'asc' },
    });

    expect(qfn.lastSql).toContain('ORDER BY "url_id" ASC');
  });

  // -------------------------------------------------------------------------
  // Alias collision detection
  // -------------------------------------------------------------------------

  it('throws on alias collision between column and expression', async () => {
    const fakeExpr = {
      _tag: 'GroupByExpression' as const,
      _column: 'clickedAt',
      sql: 'DATE("clicked_at")',
      alias: 'urlId',
    };

    const qfn = mockQueryFn([]);

    await expect(
      groupBy(qfn, clicksTable, {
        by: ['urlId', fakeExpr],
        _count: true,
      }),
    ).rejects.toThrow(/[Dd]uplicate.*alias/);
  });

  it('throws on alias collision between two expressions', async () => {
    const expr1 = {
      _tag: 'GroupByExpression' as const,
      _column: 'clickedAt',
      sql: 'DATE("clicked_at")',
      alias: 'sameAlias',
    };
    const expr2 = {
      _tag: 'GroupByExpression' as const,
      _column: 'clickedAt',
      sql: 'date_trunc(\'day\', "clicked_at")',
      alias: 'sameAlias',
    };

    const qfn = mockQueryFn([]);

    await expect(
      groupBy(qfn, clicksTable, {
        by: [expr1, expr2],
        _count: true,
      }),
    ).rejects.toThrow(/[Dd]uplicate.*alias/);
  });

  // -------------------------------------------------------------------------
  // Multiple expressions
  // -------------------------------------------------------------------------

  it('generates correct SQL for multiple expressions', async () => {
    const qfn = mockQueryFn([]);

    await groupBy(qfn, clicksTable, {
      by: [fnExtract('month', 'clickedAt'), fnExtract('year', 'clickedAt')],
      _count: true,
    });

    expect(qfn.lastSql).toContain('EXTRACT(month FROM "clicked_at") AS "extractMonthClickedAt"');
    expect(qfn.lastSql).toContain('EXTRACT(year FROM "clicked_at") AS "extractYearClickedAt"');
    expect(qfn.lastSql).toContain(
      'GROUP BY EXTRACT(month FROM "clicked_at"), EXTRACT(year FROM "clicked_at")',
    );
  });

  it('maps multiple expression result rows', async () => {
    const qfn = mockQueryFn([
      { extractMonthClickedAt: '1', extractYearClickedAt: '2024', _count: '3' },
    ]);

    const result = await groupBy(qfn, clicksTable, {
      by: [fnExtract('month', 'clickedAt'), fnExtract('year', 'clickedAt')],
      _count: true,
    });

    expect(result[0]?.extractMonthClickedAt).toBe('1');
    expect(result[0]?.extractYearClickedAt).toBe('2024');
    expect(result[0]?._count).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Expressions with aggregation functions
  // -------------------------------------------------------------------------

  it('generates correct SQL for expression with _sum', async () => {
    const pageViewsTable = d.table('page_views', {
      id: d.uuid().primary().default('gen_random_uuid()'),
      page: d.text(),
      viewedAt: d.timestamp(),
      durationMs: d.integer(),
    });

    const qfn = mockQueryFn([]);

    await groupBy(qfn, pageViewsTable, {
      by: [fnDate('viewedAt')],
      _sum: { durationMs: true },
      _count: true,
    });

    expect(qfn.lastSql).toContain('DATE("viewed_at") AS "dateViewedAt"');
    expect(qfn.lastSql).toContain('SUM("duration_ms") AS "_sum_duration_ms"');
    expect(qfn.lastSql).toContain('COUNT(*) AS "_count"');
  });

  // -------------------------------------------------------------------------
  // Expressions with where clause
  // -------------------------------------------------------------------------

  it('generates correct SQL for expression with where clause', async () => {
    const qfn = mockQueryFn([]);

    await groupBy(qfn, clicksTable, {
      by: [fnDate('clickedAt')],
      where: { urlId: 'url-1' },
      _count: true,
    });

    expect(qfn.lastSql).toContain('WHERE');
    expect(qfn.lastSql).toContain('"url_id"');
    expect(qfn.lastParams).toContain('url-1');
  });

  // -------------------------------------------------------------------------
  // SQLite dialect guard
  // -------------------------------------------------------------------------

  it('throws for dateTrunc on SQLite dialect', async () => {
    const qfn = mockQueryFn([]);
    const sqliteDialect = { name: 'sqlite' };

    await expect(
      groupBy(
        qfn,
        clicksTable,
        {
          by: [fnDateTrunc('hour', 'clickedAt')],
          _count: true,
        },
        sqliteDialect,
      ),
    ).rejects.toThrow(/date_trunc.*not supported.*SQLite/);
  });

  it('throws for extract on SQLite dialect', async () => {
    const qfn = mockQueryFn([]);
    const sqliteDialect = { name: 'sqlite' };

    await expect(
      groupBy(
        qfn,
        clicksTable,
        {
          by: [fnExtract('month', 'clickedAt')],
          _count: true,
        },
        sqliteDialect,
      ),
    ).rejects.toThrow(/EXTRACT.*not supported.*SQLite/);
  });

  it('allows d.fn.date() on SQLite dialect', async () => {
    const qfn = mockQueryFn([{ dateClickedAt: '2024-01-15', _count: '3' }]);
    const sqliteDialect = { name: 'sqlite' };

    const result = await groupBy(
      qfn,
      clicksTable,
      {
        by: [fnDate('clickedAt')],
        _count: true,
      },
      sqliteDialect,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.dateClickedAt).toBe('2024-01-15');
  });

  // -------------------------------------------------------------------------
  // Existing column-only behavior is preserved
  // -------------------------------------------------------------------------

  it('still works with plain column names (no regression)', async () => {
    const qfn = mockQueryFn([{ urlId: 'url-1', _count: '5' }]);

    const result = await groupBy(qfn, clicksTable, {
      by: ['urlId'],
      _count: true,
    });

    expect(qfn.lastSql).toContain('"url_id" AS "urlId"');
    expect(qfn.lastSql).toContain('GROUP BY "url_id"');
    expect(result[0]?.urlId).toBe('url-1');
    expect(result[0]?._count).toBe(5);
  });
});
